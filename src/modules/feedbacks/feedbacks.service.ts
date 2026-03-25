import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Feedback } from './entities/feedback.entity';
import { EvidenceSource } from './entities/evidence-message.entity';
import { CreateFeedbackDto } from './dto/create-feedback.dto';
import { FilesService } from '../files/files.service'; // 👈 Импорт

@Injectable()
export class FeedbacksService {
  constructor(
    @InjectRepository(Feedback)
    private feedbackRepo: Repository<Feedback>,
    private filesService: FilesService, // 👈 Инжектируем сервис файлов
  ) {}

  async create(patientId: string, dto: CreateFeedbackDto, operatorId: string) {
    const processedEvidence = await Promise.all(
      dto.evidence.map(async (item) => {
        let finalUrl = item.mediaUrl;

        if (item.mediaUrl && item.mediaUrl.startsWith('data:')) {
           finalUrl = await this.filesService.saveBase64(item.mediaUrl, 'evidence');
        }

        return {
          type: item.type,
          text: item.text,
          mediaUrl: finalUrl, 
          duration: item.duration,
          source: item.source || EvidenceSource.MANUAL,
          sender: item.sender || 'patient',
          originalTimestamp: item.originalTimestamp || new Date().toISOString(),
        };
      })
    );

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
}