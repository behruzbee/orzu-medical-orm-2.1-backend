import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { v4 as uuidv4 } from 'uuid';

import { Feedback } from './entities/feedback.entity';
import { PatientRequest } from '../patients/entities/patient_requests.entity';
import { RequestStatus } from 'src/common/enums/request-status.enum';
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
    private feedbackRepo: Repository<Feedback>,
    @InjectRepository(EvidenceMessage)
    private evidenceRepo: Repository<EvidenceMessage>,
    @InjectRepository(PatientRequest)
    private requestRepo: Repository<PatientRequest>,
    private readonly trelloService: TrelloService,
    private readonly configService: ConfigService,
  ) {}

  async createComplaint(
    requestId: string,
    dto: CreateFeedbackDto,
    operatorId: string,
  ) {
    return this.processAndCreateFeedback(
      requestId,
      dto,
      operatorId,
      'complaint',
    );
  }

  async createSuggestion(
    requestId: string,
    dto: CreateFeedbackDto,
    operatorId: string,
  ) {
    return this.processAndCreateFeedback(
      requestId,
      dto,
      operatorId,
      'suggestion',
    );
  }

  private async processAndCreateFeedback(
    requestId: string,
    dto: CreateFeedbackDto,
    operatorId: string,
    type: 'complaint' | 'suggestion',
  ) {
    const request = await this.requestRepo.findOne({
      where: { id: requestId },
      relations: ['patient'],
    });

    if (!request) {
      throw new NotFoundException(`Заявка с ID ${requestId} не найдена`);
    }

    const backendUrl = process.env.UPLOAD_URL || 'http://localhost:3000';

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
        newEvidence.source =
          (item.source as EvidenceSource) || EvidenceSource.MANUAL;
        newEvidence.sender = item.sender || 'patient';
        newEvidence.originalTimestamp =
          item.originalTimestamp || new Date().toISOString();

        return newEvidence;
      }),
    );

    const newFeedback = this.feedbackRepo.create({
      requestId,
      operatorId,
      ratings: dto.ratings,
      comment: dto.comment,
      evidenceMessages: processedEvidence,
    });

    const savedFeedback = await this.feedbackRepo.save(newFeedback);

    request.status =
      type === 'complaint'
        ? RequestStatus.FEEDBACK_NEGATIVE
        : RequestStatus.FEEDBACK_POSITIVE;
    await this.requestRepo.save(request);

    const listId =
      type === 'complaint'
        ? this.configService.get<string>('TRELLO_LIST_NEW_COMPLAINTS')
        : this.configService.get<string>('TRELLO_LIST_SUGGESTIONS');

    if (listId) {
      try {
        const patientName = request.patient?.name || 'Неизвестно';
        const patientPhone = request.patient?.phone || 'Неизвестно';
        const branchName = request.branch || 'Неизвестно';

        const translationMap: Record<string, string> = {
          doctors: 'Шифокорлар (Врачи)',
          nurses: 'Ҳамширалар (Медсестры)',
          cleanliness: 'Тозалик (Чистота)',
          food: 'Овқатланиш (Питание)',
          reception: 'Қабулхона (Ресепшн)',
          clinic: 'Клиника (Клиника)',
          overall: 'Умумий хулоса (Общее впечатление)',
        };

        let ratingsText = '';
        if (dto.ratings && Object.keys(dto.ratings).length > 0) {
          ratingsText =
            '\n\n📊 Баллар:\n' +
            Object.entries(dto.ratings)
              .map(([key, value]) => {
                const translatedName = translationMap[key] || key;
                return `🔹 ${translatedName}: ${value}/5`;
              })
              .join('\n');
        }

        let evidenceText = '';
        if (processedEvidence.length > 0) {
          evidenceText =
            '\n\n📎 Вложения:\n' +
            processedEvidence
              .map((e, index) => `${index + 1}. Файл: ${e.mediaUrl}`)
              .join('\n');
        }

        const dateStr = new Date().toLocaleString('ru-RU', {
          timeZone: 'Asia/Tashkent',
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        });

        let categoryText =
          type === 'complaint' ? 'Умумий (Общее)' : 'Таклиф (Предложение)';

        if (dto.category && translationMap[dto.category]) {
          categoryText = translationMap[dto.category];
        }

        const cardName = `${branchName.toUpperCase()} — ${categoryText}`;

        const titleType = type === 'complaint' ? 'Жалоба' : 'Предложение';
        const icon = type === 'complaint' ? '📋' : '💡';

        const cardDesc = `${icon} ${titleType} от пациента
👤 ФИО: ${patientName}
📞 Телефон: ${patientPhone}
🏥 Филиал: ${branchName}
📂 Категория: ${categoryText}
📝 Текст ва Далиллар:
${dto.comment || 'Пациент не оставил комментарий.'}${evidenceText}${ratingsText}

📅 Дата: ${dateStr}
🆔 FeedbackID: ${savedFeedback.id}`;

        const card = await this.trelloService.createCard(
          listId,
          cardName,
          cardDesc,
        );

        if (card && card.shortUrl) {
          savedFeedback.trelloUrl = card.shortUrl;
          await this.feedbackRepo.save(savedFeedback);
        }
      } catch (error) {
        console.error(`Ошибка при отправке ${type} в Trello:`, error.message);
      }
    }

    return savedFeedback;
  }

  async findAll() {
    return this.feedbackRepo.find({
      relations: ['request', 'evidenceMessages'],
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

  async revertFeedback(feedbackId: string) {
    const feedback = await this.feedbackRepo.findOne({
      where: { id: feedbackId },
      relations: ['request'],
    });

    if (!feedback) {
      throw new NotFoundException(`Отзыв с ID ${feedbackId} не найден`);
    }

    try {
      if (feedback.trelloUrl) {
        const trelloCardId = feedback.trelloUrl.split('/').pop()!;

        await this.trelloService.deleteCard(trelloCardId);
      }
    } catch (error) {
      console.error(`Ошибка при удалении карточки Trello:`, error.message);
    }

    if (feedback.request) {
      feedback.request.status = RequestStatus.CONTACTED;
      await this.requestRepo.save(feedback.request);
    }

    await this.feedbackRepo.remove(feedback);

    return {
      success: true,
      message:
        'Отзыв успешно отменен, статус заявки восстановлен, карточка в Trello удалена.',
    };
  }
}
