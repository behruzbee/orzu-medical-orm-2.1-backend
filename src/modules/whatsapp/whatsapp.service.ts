import {
  Injectable,
  OnModuleInit,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import * as os from 'os';
import { Client, LocalAuth, Message, MessageMedia } from 'whatsapp-web.js';
import { Subject, Observable } from 'rxjs';
import { InjectRepository } from '@nestjs/typeorm';
import { Patient } from '../patients/entities/patient.entity';
import { Repository } from 'typeorm';
import { PatientStatus } from 'src/common/enums/patient-status.enum';
import { BroadcastDto } from './dto/broadcast.dto';

@Injectable()
export class WhatsappService implements OnModuleInit {
  private client: Client;
  private readonly logger = new Logger(WhatsappService.name);

  private qrSubject = new Subject<{ qr: string }>();
  private statusSubject = new Subject<{ status: string; user?: any }>();

  constructor(
    @InjectRepository(Patient)
    private patientRepository: Repository<Patient>,
  ) {
    // Check if OS is Mac ('darwin'), otherwise use the Linux path
    const defaultChromePath =
      os.platform() === 'darwin'
        ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
        : '/usr/bin/google-chrome';

    this.client = new Client({
      authStrategy: new LocalAuth({ dataPath: './whatsapp-session' }),
      puppeteer: {
        // It will still prefer your .env variable if it exists, otherwise it safely falls back based on your OS
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
      // Если хотите видеть QR в терминале, раскомментируйте:
      // require('qrcode-terminal').generate(qr, { small: true });
      this.qrSubject.next({ qr });
    });

    this.client.on('ready', () => {
      this.logger.log('WhatsApp Client is Ready!');
      this.statusSubject.next({ status: 'connected' });
    });

    this.client.on('disconnected', () => {
      this.logger.warn('WhatsApp disconnected');
      // Пытаемся переподключиться
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
    try {
      const cleanPhone = phone.replace(/\D/g, '');
      if (!cleanPhone) throw new BadRequestException('Invalid phone number');

      if (!this.client.info) {
        this.logger.warn('WhatsApp client not ready');
        return [];
      }

      const registeredUser = await this.client.getNumberId(cleanPhone);
      if (!registeredUser) {
        this.logger.warn(`Number ${cleanPhone} is NOT registered on WhatsApp.`);
        return [];
      }

      const chatId = registeredUser._serialized; 

      try {
        const page = (this.client as any).pupPage;
        if (page) {
          await page.evaluate(() => {
            if (window['Store'] && typeof window['Store'].waitForChatLoading === 'undefined') {
              window['Store'].waitForChatLoading = () => new Promise(resolve => setTimeout(resolve, 500));
            }
          });
        }
      } catch (injectErr) {
        this.logger.error(`Не удалось внедрить фикс: ${injectErr.message}`);
      }

      let chat;
      try {
        chat = await this.client.getChatById(chatId);
      } catch (err) {
        this.logger.error(`Chat for ${chatId} not found in the current local session.`);
        return [];
      }

      // 🚀 Теперь это сработает без краша!
      const messages = await chat.fetchMessages({ limit });
      
      if (!messages || messages.length === 0) {
        this.logger.log(`Chat found for ${chatId}, but there are 0 messages in the local cache.`);
        return [];
      }

      const formattedMessages = await Promise.all(
        messages.map(async (msg) => {
          let mediaUrl: string | undefined = undefined;

          if (msg.hasMedia) {
            try {
              const media = await msg.downloadMedia();
              if (media) {
                mediaUrl = `data:${media.mimetype};base64,${media.data}`;
              }
            } catch (err) {
              this.logger.error(`Failed to download media for msg ${msg.id.id}`);
            }
          }

          return {
            id: msg.id.id,
            sender: msg.fromMe ? 'operator' : 'patient',
            text: msg.body,
            type: msg.type === 'ptt' ? 'audio' : msg.hasMedia ? msg.type : 'text',
            timestamp: new Date(msg.timestamp * 1000).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            }),
            status: msg.ack >= 3 ? 'read' : 'sent',
            duration: msg.duration ? this.formatDuration(Number(msg.duration)) : undefined,
            mediaUrl: mediaUrl,
          };
        }),
      );

      return formattedMessages;
    } catch (e) {
      this.logger.error(`Critical error fetching history for ${phone}: ${e.stack}`);
      return [];
    }
  }
  async sendText(phone: string, text: string) {
    const chatId = this.getChatId(phone);

    const response = await this.client.sendMessage(chatId, text, {
      sendSeen: false,
    });

    await this.updatePatientStatusToContacted(phone);

    return response;
  }

  async sendMedia(phone: string, fileUrl: string, caption?: string) {
    const chatId = this.getChatId(phone);
    const media = await MessageMedia.fromUrl(fileUrl);
    const response = await this.client.sendMessage(chatId, media, { caption });
    await this.updatePatientStatusToContacted(phone);
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

    const qb = this.patientRepository.createQueryBuilder('patient');

    // Применяем фильтры (точно как в PatientsService)
    if (dto.status) qb.andWhere('patient.status = :status', { status: dto.status });
    if (dto.branch) qb.andWhere('patient.branch = :branch', { branch: dto.branch });

    const COUNTRY_CODES: Record<string, string> = {
      Russia: '+7', Uzbekistan: '+998', Kazakhstan: '+77',
      USA: '+1', Turkey: '+90', Korea: '+82',
    };

    if (dto.phoneCode) {
      const code = COUNTRY_CODES[dto.phoneCode] || dto.phoneCode;
      qb.andWhere('patient.phone LIKE :phoneCode', { phoneCode: `%${code}%` });
    }

    if (dto.dateFrom && dto.dateTo) {
  qb.andWhere('patient.departureDate BETWEEN :dateFrom::timestamp AND :dateTo::timestamp', { 
    dateFrom: dto.dateFrom, 
    dateTo: dto.dateTo 
  });
} else if (dto.dateFrom) {
  qb.andWhere('patient.departureDate >= :dateFrom::timestamp', { 
    dateFrom: dto.dateFrom 
  });
}

    // Получаем всех пациентов, подходящих под фильтр
    const patients = await qb.getMany();

    if (patients.length === 0) {
      throw new BadRequestException("Ushbu filtrlar bo'yicha bemorlar topilmadi");
    }

    // Запускаем рассылку В ФОНЕ (без await), чтобы не блокировать HTTP ответ
    this.processBackgroundBroadcast(patients, dto.text);

    return {
      success: true,
      message: "Rassilka boshlandi",
      targetCount: patients.length,
    };
  }

  private async processBackgroundBroadcast(patients: Patient[], text: string) {
    this.logger.log(`Starting broadcast for ${patients.length} patients...`);
    let sentCount = 0;

    for (const patient of patients) {
      try {
        if (patient.phone) {
          await this.sendText(patient.phone, text);
          sentCount++;
          
          // 🔥 СЛУЧАЙНАЯ ЗАДЕРЖКА от 3 до 7 секунд (Защита от бана WhatsApp)
          const delay = Math.floor(Math.random() * 4000) + 3000;
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      } catch (err) {
        this.logger.error(`Failed to send broadcast to ${patient.phone}: ${err.message}`);
      }
    }

    this.logger.log(`Broadcast finished. Successfully sent: ${sentCount}/${patients.length}`);
  }

  private async updatePatientStatusToContacted(phone: string) {
    try {
      const patient = await this.patientRepository.findOne({
        where: {
          phone: `${phone}`,
        },
      });

      if (patient && patient.status === PatientStatus.NEW) {
        patient.status = PatientStatus.CONTACTED;
        await this.patientRepository.save(patient);
      }
    } catch (e) {
      this.logger.error(`Error updating patient status: ${e.message}`);
    }
  }
}
