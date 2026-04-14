import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { DataSource, DeepPartial } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { FilesService } from '../../files/files.service';
import { TrelloService } from '../../trello/services/trello.service';
import { v4 as uuidv4 } from 'uuid';
import { Patient } from '../entities/patient.entity';
import { PatientStatus } from 'src/common/enums/patient-status.enum';
import { AddCallStatusDto } from '../../call-history/dto/add-call-status.dto';
import { CallStatus } from '../../call-history/entities/call-status.entity';
import { CreateFeedbackDto } from '../../feedbacks/dto/create-feedback.dto';
import { Feedback } from '../../feedbacks/entities/feedback.entity';
import {
  EvidenceMessage,
  EvidenceSource,
} from '../../feedbacks/entities/evidence-message.entity';

@Injectable()
export class PatientActionsService {
  private readonly logger = new Logger(PatientActionsService.name);

  private readonly CATEGORIES_MAP: Record<string, string> = {
    doctors: 'Шифокорлар (Врачи)',
    nurses: 'Хамширалар (Медсестры)',
    cleanliness: 'Тозалик (Чистота)',
    food: 'Ошхона (Еда)',
    overall: 'Умумий (Общее)',
  };

  constructor(
    private dataSource: DataSource,
    private filesService: FilesService,
    private configService: ConfigService,
    private trelloService: TrelloService,
  ) {}

  async addCallStatusTransactional(
    patientId: string,
    dto: AddCallStatusDto,
    operatorId: string,
  ) {
    if (!operatorId) {
      throw new InternalServerErrorException(
        'Operator ID is missing inside Service',
      );
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const patient = await queryRunner.manager.findOne(Patient, {
        where: { id: patientId },
      });

      if (!patient) throw new NotFoundException('Bemor topilmadi');

      patient.status = dto.status;
      await queryRunner.manager.save(patient);

      const callStatus = queryRunner.manager.create(CallStatus, {
        patientId: patient.id,
        status: dto.status,
        note: dto.note || '',
        operatorId: operatorId,
      });

      const savedCall = await queryRunner.manager.save(callStatus);

      await queryRunner.commitTransaction();
      return savedCall;
    } catch (err) {
      await queryRunner.rollbackTransaction();
      this.logger.error(`Transaction failed: ${err.message}`);
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  async addFeedbackTransactional(
    patientId: string,
    dto: CreateFeedbackDto,
    operatorId: string,
  ) {
    if (!operatorId)
      throw new InternalServerErrorException('Operator ID is missing');

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    let savedFeedback: Feedback;
    let patient: Patient | null;

    try {
      patient = await queryRunner.manager.findOne(Patient, {
        where: { id: patientId },
      });
      if (!patient) throw new NotFoundException('Bemor topilmadi');

      const isComplaint = Object.values(dto.ratings).some((r) => r < 5);
      const newStatus = isComplaint
        ? PatientStatus.FEEDBACK_NEGATIVE
        : PatientStatus.FEEDBACK_POSITIVE;

      patient.status = newStatus;
      await queryRunner.manager.save(patient);

      const evidenceEntities: EvidenceMessage[] = [];
      const backendUrl = this.configService.get<string>('UPLOAD_URL') || 'http://localhost:3000';

      for (const item of dto.evidence) {
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

            // Формируем URL к вашему контроллеру
            finalUrl = `${backendUrl}/api/feedbacks/evidence/${evidenceId}/file`;
          }
        }

        const evidenceEntity = queryRunner.manager.create(EvidenceMessage, {
          id: evidenceId,
          type: item.type,
          text: item.text,
          mediaUrl: finalUrl,
          mediaData: buffer,
          mimeType: mimeType,
          duration: item.duration,
          source: item.source || EvidenceSource.MANUAL,
          sender: item.sender || 'patient',
          originalTimestamp: item.originalTimestamp || new Date().toISOString(),
        } as DeepPartial<EvidenceMessage>);

        evidenceEntities.push(evidenceEntity);
      }

      const feedback = queryRunner.manager.create(Feedback, {
        patientId: patient.id,
        operatorId: operatorId,
        ratings: dto.ratings,
        comment: dto.comment,
        evidenceMessages: evidenceEntities,
      });

      savedFeedback = await queryRunner.manager.save(feedback);

      if (isComplaint || dto.sendToTrello) {
        await this.sendToTrello(patient, savedFeedback, dto);
      } else {
        this.logger.log(`Идеальный отзыв ${savedFeedback.id} сохранен только в БД. Флаг sendToTrello не передан.`);
      }

      await queryRunner.commitTransaction();
      return savedFeedback;
    } catch (err) {
      await queryRunner.rollbackTransaction();
      this.logger.error(`Feedback transaction failed: ${err.message}`);
      throw new InternalServerErrorException(`Trello or Database Error: ${err.message}`);
    } finally {
      await queryRunner.release();
    }
  }

  private async sendToTrello(patient: Patient, feedback: Feedback, dto: CreateFeedbackDto) {
    const isComplaint = Object.values(dto.ratings).some((r) => r < 5);
    
    const listId = isComplaint 
      ? this.configService.get('TRELLO_LIST_NEW_COMPLAINTS') 
      : this.configService.get('TRELLO_LIST_RESOLVED');
    
    const boardId = this.configService.get('TRELLO_BOARD_ID');

    let badCategoryKey = Object.keys(dto.ratings).find(k => dto.ratings[k] < 5);
    if (!badCategoryKey) badCategoryKey = 'overall';
    const categoryName = this.CATEGORIES_MAP[badCategoryKey] || badCategoryKey;

    const evidenceText = feedback.evidenceMessages.map(e => {
      if (e.type === 'text') return e.text;
      
      const linkLabel = e.type === 'audio' ? '🎵 Эшитиш (Овозли хабар)' : `🔗 Файлни очиш (${e.type})`;
      return e.mediaUrl ? `[${linkLabel}](${e.mediaUrl})` : `[Файл йўқ]`;
    }).join('\n\n');


    const cardTitle = `${patient.branch} — ${categoryName}`;
    const cardType = isComplaint ? '📋 Жалоба от пациента' : '💡 Предложение от пациента';
    
    const dateStr = new Date().toLocaleString('ru-RU', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    });

    const cardDesc = `${cardType}
👤 ФИО: ${patient.name}
📞 Телефон: ${patient.phone}
🏥 Филиал: ${patient.branch}
📂 Категория: ${categoryName}
📝 Текст ва Далиллар:
${evidenceText}

📅 Дата: ${dateStr}
🆔 FeedbackID: ${feedback.id}`;

    const labelId = await this.trelloService.getOrCreateBranchLabel(boardId, patient.branch);
    
    await this.trelloService.createCard(listId, cardTitle, cardDesc, labelId);
    
    this.logger.log(`Trello card created successfully for Feedback: ${feedback.id}`);
  }

  async revertStatus(id: string) {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const patient = await queryRunner.manager.findOne(Patient, {
        where: { id },
        relations: ['callHistory', 'feedbacks'],
      });

      if (!patient) throw new NotFoundException('Bemor topilmadi');

      const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;
      const timeDiff =
        new Date().getTime() - new Date(patient.updatedAt).getTime();

      if (timeDiff > ONE_WEEK_MS) {
        throw new BadRequestException(
          "Statusni qaytarish muddati (1 hafta) o'tib ketgan",
        );
      }

      const allActions = [
        ...patient.callHistory.map((c) => ({ ...c, type: 'call' as const })),
        ...patient.feedbacks.map((f) => ({ ...f, type: 'feedback' as const })),
      ].sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );

      const lastAction = allActions[0];

      if (lastAction) {
        if (lastAction.type === 'call') {
          await queryRunner.manager.delete(CallStatus, lastAction.id);
          this.logger.log(`Reverted: Deleted CallStatus ${lastAction.id}`);
        } else {
          await queryRunner.manager.delete(Feedback, lastAction.id);
          this.logger.log(`Reverted: Deleted Feedback ${lastAction.id}`);
          
          await this.trelloService.deleteCardByFeedbackId(lastAction.id);
        }
      }

      patient.status = PatientStatus.CONTACTED;

      await queryRunner.manager.save(patient);

      await queryRunner.commitTransaction();

      return {
        message: "Status qaytarildi va oxirgi harakat o'chirildi",
        status: PatientStatus.CONTACTED,
      };
    } catch (err) {
      await queryRunner.rollbackTransaction();
      this.logger.error(`Revert status failed: ${err.message}`);
      throw err;
    } finally {
      await queryRunner.release();
    }
  }
}