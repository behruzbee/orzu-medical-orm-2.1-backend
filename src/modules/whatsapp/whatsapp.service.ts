import {
  Injectable,
  OnModuleInit,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import * as os from 'os';
import { Client, LocalAuth, MessageMedia } from 'whatsapp-web.js';
import { Subject, Observable } from 'rxjs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Patient } from '../patients/entities/patient.entity';
import { PatientRequest } from '../patients/entities/patient_requests.entity';
import { RequestStatus } from 'src/common/enums/request-status.enum';
import { BroadcastDto } from './dto/broadcast.dto';

@Injectable()
export class WhatsappService implements OnModuleInit {
  private client: Client;
  private initPromise: Promise<void> | null = null;
  private isReady = false;
  private hasStartBeenRequested = false;
  private readonly logger = new Logger(WhatsappService.name);

  private qrSubject = new Subject<{ qr: string }>();
  private statusSubject = new Subject<{ status: string; user?: any }>();

  constructor(
    @InjectRepository(PatientRequest)
    private requestRepository: Repository<PatientRequest>,
    @InjectRepository(Patient)
    private patientRepository: Repository<Patient>,
  ) {
    this.client = this.createClient();
  }

  onModuleInit() {
    if (process.env.WHATSAPP_AUTO_START === 'true') {
      void this.startClient('module-init').catch(() => undefined);
      return;
    }

    this.logger.log(
      'WhatsApp auto-start is disabled. Client will start on QR stream or send action.',
    );
  }

  private createClient() {
    const defaultChromePath =
      os.platform() === 'darwin'
        ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
        : '/usr/bin/chromium';
    const executablePath =
      process.env.CHROME_BIN ||
      process.env.PUPPETEER_EXECUTABLE_PATH ||
      defaultChromePath;

    const client = new Client({
      authStrategy: new LocalAuth({ dataPath: './whatsapp-session' }),
      puppeteer: {
        executablePath,
        headless: true,
        timeout: 60000,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--disable-software-rasterizer',
          '--disable-crash-reporter',
          '--disable-extensions',
          '--disable-background-networking',
          '--disable-sync',
          '--no-first-run',
          '--no-zygote',
          '--disable-features=Translate,BackForwardCache,AcceptCHFrame,MediaRouter,OptimizationHints',
        ],
      },
    });

    this.initializeClientEvents(client);
    return client;
  }

  private initializeClientEvents(client: Client) {
    client.on('qr', (qr) => {
      this.logger.log('New QR Code generated');
      this.qrSubject.next({ qr });
    });

    client.on('ready', () => {
      this.isReady = true;
      this.logger.log('WhatsApp Client is Ready!');
      this.statusSubject.next({ status: 'connected' });
    });

    client.on('auth_failure', (message) => {
      this.isReady = false;
      this.logger.error(`WhatsApp auth failure: ${message}`);
      this.statusSubject.next({ status: 'auth_failure' });
    });

    client.on('disconnected', () => {
      this.isReady = false;
      this.logger.warn('WhatsApp disconnected');
      this.statusSubject.next({ status: 'disconnected' });

      if (
        this.hasStartBeenRequested &&
        process.env.WHATSAPP_AUTO_RECONNECT !== 'false'
      ) {
        setTimeout(() => {
          void this.startClient('reconnect').catch(() => undefined);
        }, 5000);
      }
    });
  }

  private async startClient(reason: string) {
    this.hasStartBeenRequested = true;

    if (this.isReady || this.client.info) {
      return;
    }

    if (this.initPromise) {
      return this.initPromise;
    }

    this.logger.log(`Starting WhatsApp client (${reason})...`);

    this.initPromise = this.client
      .initialize()
      .then(() => undefined)
      .catch(async (error) => {
        this.isReady = false;
        this.logger.error(
          `WhatsApp client failed to start: ${error?.message || error}`,
        );
        this.statusSubject.next({ status: 'error' });

        try {
          await this.client.destroy();
        } catch {
          // The browser may not exist when Puppeteer fails during launch.
        }

        this.client = this.createClient();
        throw error;
      })
      .finally(() => {
        this.initPromise = null;
      });

    return this.initPromise;
  }

  private async ensureReady() {
    if (!this.client.info) {
      try {
        await this.startClient('whatsapp-action');
      } catch {
        throw new BadRequestException(
          'WhatsApp client could not start. Check Chromium/Puppeteer logs.',
        );
      }
    }

    if (!this.client.info) {
      throw new BadRequestException('WhatsApp client not ready');
    }
  }

  getQrStream(): Observable<{ qr: string }> {
    void this.startClient('qr-stream').catch(() => undefined);
    return this.qrSubject.asObservable();
  }

  getCurrentUserPhone(): string | null {
    if (!this.client.info) return null;
    return this.client.info.wid.user;
  }

  isSessionActive(): boolean {
    return !!this.client.info;
  }

  async reload() {
    this.isReady = false;
    await this.client.destroy();
    this.client = this.createClient();
    await this.startClient('reload');
  }

  private getChatId(phone: string): string {
    const cleanPhone = phone.replace(/\D/g, '');
    if (!cleanPhone) throw new BadRequestException('Invalid phone number');
    return `${cleanPhone}@c.us`;
  }

  async getChatHistory(phone: string, limit = 50) {
    return [];
  }

  // 👈 Accept optional requestId
  async sendText(phone: string, text: string, requestId?: string) {
    await this.ensureReady();
    const chatId = this.getChatId(phone);

    const response = await this.client.sendMessage(chatId, text, {
      sendSeen: false,
    });

    await this.updateRequestStatusToContacted(phone, requestId);

    return response;
  }

  // 👈 Accept optional requestId
  async sendMedia(
    phone: string,
    fileUrl: string,
    caption?: string,
    requestId?: string,
  ) {
    await this.ensureReady();
    const chatId = this.getChatId(phone);
    const media = await MessageMedia.fromUrl(fileUrl);
    const response = await this.client.sendMessage(chatId, media, { caption });

    await this.updateRequestStatusToContacted(phone, requestId);

    return response;
  }

  private formatDuration(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  }

  async broadcastByFilters(dto: BroadcastDto) {
    await this.ensureReady();

    const qb = this.requestRepository
      .createQueryBuilder('request')
      .leftJoinAndSelect('request.patient', 'patient');

    if (dto.status)
      qb.andWhere('request.status = :status', { status: dto.status });
    if (dto.branch)
      qb.andWhere('request.branch = :branch', { branch: dto.branch });

    const COUNTRY_CODES: Record<string, string> = {
      Russia: '+7',
      Uzbekistan: '+998',
      Kazakhstan: '+77',
      USA: '+1',
      Turkey: '+90',
      Korea: '+82',
    };

    if (dto.phoneCode) {
      const code = COUNTRY_CODES[dto.phoneCode] || dto.phoneCode;
      qb.andWhere('patient.phone LIKE :phoneCode', { phoneCode: `%${code}%` });
    }

    if (dto.dateFrom && dto.dateTo) {
      qb.andWhere(
        'request.departureDate BETWEEN :dateFrom::timestamp AND :dateTo::timestamp',
        {
          dateFrom: dto.dateFrom,
          dateTo: dto.dateTo,
        },
      );
    } else if (dto.dateFrom) {
      qb.andWhere('request.departureDate >= :dateFrom::timestamp', {
        dateFrom: dto.dateFrom,
      });
    }

    const requests = await qb.getMany();

    if (requests.length === 0) {
      throw new BadRequestException(
        "Ushbu filtrlar bo'yicha bemorlar topilmadi",
      );
    }

    this.processBackgroundBroadcast(requests, dto.text);

    return {
      success: true,
      message: 'Rassilka boshlandi',
      targetCount: requests.length,
    };
  }

  private async processBackgroundBroadcast(
    requests: PatientRequest[],
    text: string,
  ) {
    this.logger.log(`Starting broadcast for ${requests.length} requests...`);
    let sentCount = 0;

    for (const req of requests) {
      try {
        const phone = req.patient?.phone;

        if (phone) {
          // 👈 Pass req.id to the sendText method
          await this.sendText(phone, text, req.id);
          sentCount++;

          const delay = Math.floor(Math.random() * 4000) + 3000;
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      } catch (err) {
        this.logger.error(
          `Failed to send broadcast to request ID ${req.id}: ${err.message}`,
        );
      }
    }

    this.logger.log(
      `Broadcast finished. Successfully sent: ${sentCount}/${requests.length}`,
    );
  }

  // 👈 Modified to prioritize requestId if provided
  private async updateRequestStatusToContacted(
    phone: string,
    requestId?: string,
  ) {
    try {
      let targetRequest: PatientRequest | null = null;

      // Use specific requestId if available for precision
      if (requestId) {
        targetRequest = await this.requestRepository.findOne({
          where: { id: requestId, status: RequestStatus.NEW },
        });
      }
      // Fallback: Use phone to find patient, then find the NEW request
      else {
        const patient = await this.patientRepository.findOne({
          where: { phone },
          relations: ['requests'],
        });

        if (patient && patient.requests.length > 0) {
          targetRequest =
            patient.requests.find((req) => req.status === RequestStatus.NEW) ||
            null;
        }
      }

      if (targetRequest) {
        targetRequest.status = RequestStatus.CONTACTED;
        await this.requestRepository.save(targetRequest);
      }
    } catch (e) {
      this.logger.error(`Error updating request status: ${e.message}`);
    }
  }
}
