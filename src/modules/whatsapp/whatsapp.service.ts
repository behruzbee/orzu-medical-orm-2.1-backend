import {
  Injectable,
  OnModuleInit,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { Client, LocalAuth, MessageMedia } from 'whatsapp-web.js';
import { Subject, Observable } from 'rxjs';
import { InjectRepository } from '@nestjs/typeorm';
import { Patient } from '../patients/entities/patient.entity';
import { Repository } from 'typeorm';
import { PatientStatus } from 'src/common/enums/patient-status.enum';

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
    this.client = new Client({
      authStrategy: new LocalAuth({ dataPath: './whatsapp-session' }),
      puppeteer: {
        headless: true,
        // Путь к Chrome может отличаться на сервере, лучше использовать переменные окружения
        executablePath:
          '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
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
      const chatId = this.getChatId(phone);

      if (!this.client.info) {
        this.logger.warn('WhatsApp client not ready');
        return [];
      }

      const chat = await this.client.getChatById(chatId);
      const messages = await chat.fetchMessages({ limit });

      // 🔥 ИСПОЛЬЗУЕМ Promise.all, чтобы скачать медиа для каждого сообщения
      const formattedMessages = await Promise.all(
        messages.map(async (msg) => {
          let mediaUrl: string | undefined = undefined;

          // 1. Если есть медиа, пытаемся его скачать
          if (msg.hasMedia) {
            try {
              const media = await msg.downloadMedia();
              if (media) {
                // Формируем Data URI (Base64), который понимает браузер
                // Пример: "data:image/jpeg;base64,/9j/4AAQSkZJRg..."
                mediaUrl = `data:${media.mimetype};base64,${media.data}`;
              }
            } catch (err) {
              this.logger.error(
                `Failed to download media for msg ${msg.id.id}`,
              );
              // Если файл старый, WhatsApp может не отдать его, оставляем undefined
            }
          }

          return {
            id: msg.id.id,
            sender: msg.fromMe ? 'operator' : 'patient',
            text: msg.body, // Текст или подпись к фото
            type:
              msg.type === 'ptt' ? 'audio' : msg.hasMedia ? msg.type : 'text',
            timestamp: new Date(msg.timestamp * 1000).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            }),
            status: msg.ack >= 3 ? 'read' : 'sent',
            duration: msg.duration
              ? this.formatDuration(Number(msg.duration))
              : undefined,
            // 👇 Добавляем ссылку на медиа
            mediaUrl: mediaUrl,
          };
        }),
      );

      return formattedMessages;
    } catch (e) {
      this.logger.warn(`Chat not found or error for ${phone}: ${e.message}`);
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
