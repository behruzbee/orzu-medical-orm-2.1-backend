import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid'; 
import { Feedback } from './entities/feedback.entity';
import {
  EvidenceMessage,
  EvidenceSource,
  EvidenceType,
} from './entities/evidence-message.entity';
import { CreateFeedbackDto } from './dto/create-feedback.dto';

@Injectable()
export class FeedbacksService {
  constructor(
    @InjectRepository(Feedback)
    private feedbackRepo: Repository<Feedback>,

    @InjectRepository(EvidenceMessage)
    private evidenceRepo: Repository<EvidenceMessage>,
  ) {}

  async create(patientId: string, dto: CreateFeedbackDto, operatorId: string) {
    const backendUrl = process.env.UPLOAD_URL || 'http://localhost:3000';

    const processedEvidence = await Promise.all(
      dto.evidence.map(async (item) => {
        let buffer: Buffer | null = null;
        let mimeType: string | null = null;
        let finalUrl = item.mediaUrl;

        // Генерируем уникальный ID заранее
        const evidenceId = uuidv4();

        // Если прилетел файл (Base64)
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

    // Создаем сам отзыв и привязываем к нему подготовленные доказательства
    const feedback = this.feedbackRepo.create({
      patientId,
      operatorId,
      ratings: dto.ratings,
      comment: dto.comment,
      evidenceMessages: processedEvidence,
    });

    return this.feedbackRepo.save(feedback);
  }

  async findAll() {
    return this.feedbackRepo.find({
      relations: ['patient', 'evidenceMessages'],
      order: { createdAt: 'DESC' },
    });
  }

  // Метод для отдачи файла контроллеру
  async getEvidenceFile(id: string) {
    const evidence = await this.evidenceRepo.findOne({
      where: { id },
      // Принудительно запрашиваем mediaData, так как в сущности стоит select: false
      select: ['id', 'mediaData', 'mimeType'],
    });

    if (!evidence || !evidence.mediaData) {
      throw new NotFoundException('Fayl topilmadi yoki u bazada yo`q');
    }

    return evidence;
  }
}
