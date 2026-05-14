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
  private readonly logger = new Logger(WhatsappService.name);

  private qrSubject = new Subject<{ qr: string }>();
  private statusSubject = new Subject<{ status: string; user?: any }>();

  constructor(
    @InjectRepository(PatientRequest)
    private requestRepository: Repository<PatientRequest>,
    @InjectRepository(Patient)
    private patientRepository: Repository<Patient>,
  ) {
    const defaultChromePath =
      os.platform() === 'darwin'
        ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
        : '/usr/bin/google-chrome';

    this.client = new Client({
      authStrategy: new LocalAuth({ dataPath: './whatsapp-session' }),
      puppeteer: {
        executablePath: process.env.CHROME_BIN || defaultChromePath,
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
        ],
      },
    });
    this.initializeClient();
  }

  onModuleInit() {
    this.client.initialize();
  }

  private initializeClient() {
    this.client.on('qr', (qr) => {
      this.logger.log('New QR Code generated');
      this.qrSubject.next({ qr });
    });

    this.client.on('ready', () => {
      this.logger.log('WhatsApp Client is Ready!');
      this.statusSubject.next({ status: 'connected' });
    });

    this.client.on('disconnected', () => {
      this.logger.warn('WhatsApp disconnected');
      this.client.initialize();
    });
  }

  getQrStream(): Observable<{ qr: string }> {
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
    await this.client.destroy();
    await this.client.initialize();
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
    const chatId = this.getChatId(phone);

    const response = await this.client.sendMessage(chatId, text, {
      sendSeen: false,
    });

    await this.updateRequestStatusToContacted(phone, requestId);

    return response;
  }

  // 👈 Accept optional requestId
  async sendMedia(phone: string, fileUrl: string, caption?: string, requestId?: string) {
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
    if (!this.client.info) {
      throw new BadRequestException('WhatsApp client not ready');
    }

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
  private async updateRequestStatusToContacted(phone: string, requestId?: string) {
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
          targetRequest = patient.requests.find(
            (req) => req.status === RequestStatus.NEW,
          ) || null;
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