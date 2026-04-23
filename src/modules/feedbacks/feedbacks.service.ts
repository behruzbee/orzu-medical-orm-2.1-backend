import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config'; // Обязательно импортируйте ConfigService
import { v4 as uuidv4 } from 'uuid';
import { Feedback } from './entities/feedback.entity';
import {
  EvidenceMessage,
  EvidenceSource,
  EvidenceType,
} from './entities/evidence-message.entity';
import { CreateFeedbackDto } from './dto/create-feedback.dto';
import { TrelloService } from '../trello/services/trello.service';

@Injectable()
export class FeedbacksService {
  constructor(
    @InjectRepository(Feedback)
    private feedbackRepo: Repository<Feedback>, // У вас тут feedbackRepo (без sitory)
    @InjectRepository(EvidenceMessage)
    private evidenceRepo: Repository<EvidenceMessage>,
    private readonly trelloService: TrelloService,
    private readonly configService: ConfigService, // Добавили для получения ID списков Trello
  ) {}

  async create(patientId: string, dto: CreateFeedbackDto, operatorId: string) {
    const backendUrl = process.env.UPLOAD_URL || 'http://localhost:3000';

    // 1. Обработка файлов (доказательств)
    const processedEvidence = await Promise.all(
      dto.evidence.map(async (item) => {
        let buffer: Buffer | null = null;
        let mimeType: string | null = null;
        let finalUrl = item.mediaUrl;

        const evidenceId = uuidv4();

        if (item.mediaUrl && item.mediaUrl.startsWith('data:')) {
          const matches = item.mediaUrl.match(/^data:(.+);base64,(.+)$/);

          if (matches && matches.length === 3) {
            mimeType = matches[1];
            buffer = Buffer.from(matches[2], 'base64');
            finalUrl = `${backendUrl}/api/feedbacks/evidence/${evidenceId}/file`;
          }
        }

        const newEvidence = new EvidenceMessage();
        newEvidence.id = evidenceId;
        newEvidence.type = item.type as EvidenceType;
        newEvidence.text = item.text || '';
        newEvidence.mediaUrl = finalUrl || '';
        newEvidence.mediaData = buffer || Buffer.from('');
        newEvidence.mimeType = mimeType || '';
        newEvidence.duration = item.duration || '';
        newEvidence.source = (item.source as EvidenceSource) || EvidenceSource.MANUAL;
        newEvidence.sender = item.sender || 'patient';
        newEvidence.originalTimestamp = item.originalTimestamp || new Date().toISOString();

        return newEvidence;
      }),
    );

    // 2. СНАЧАЛА создаем и сохраняем сам отзыв в базу
    const newFeedback = this.feedbackRepo.create({
      patientId,
      operatorId,
      ratings: dto.ratings,
      comment: dto.comment,
      evidenceMessages: processedEvidence,
    });

    const savedFeedback = await this.feedbackRepo.save(newFeedback);

    // 3. ПОСЛЕ сохранения у нас есть savedFeedback.id. Создаем карточку в Trello.
    // Если это жалоба (оценки низкие), берем список входящих жалоб
    const listId = this.configService.get<string>('TRELLO_LIST_NEW_COMPLAINTS'); 
    
    if (listId) {
      try {
        // Формируем название и описание для Trello
        const cardName = `Обращение от пациента (ID: ${patientId.slice(0, 8)})`;
        const cardDesc = `FeedbackID: ${savedFeedback.id}\n\nКомментарий: ${dto.comment || 'Нет комментария'}`;

        const card = await this.trelloService.createCard(listId, cardName, cardDesc);

        // 4. Если карточка успешно создалась, сохраняем ссылку в базу
        if (card && card.shortUrl) {
          savedFeedback.trelloUrl = card.shortUrl;
          await this.feedbackRepo.save(savedFeedback); // Обновляем запись
        }
      } catch (error) {
        // Оборачиваем в try-catch, чтобы ошибка Trello не сломала сохранение отзыва
        console.error('Ошибка при отправке в Trello:', error.message);
      }
    }

    // Возвращаем итоговый сохраненный отзыв (уже со ссылкой на Trello, если она создалась)
    return savedFeedback;
  }

  async findAll() {
    return this.feedbackRepo.find({
      relations: ['patient', 'evidenceMessages'],
      order: { createdAt: 'DESC' },
    });
  }

  async getEvidenceFile(id: string) {
    const evidence = await this.evidenceRepo.findOne({
      where: { id },
      select: ['id', 'mediaData', 'mimeType'],
    });

    if (!evidence || !evidence.mediaData) {
      throw new NotFoundException('Fayl topilmadi yoki u bazada yo`q');
    }

    return evidence;
  }
}