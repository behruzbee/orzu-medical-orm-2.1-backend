import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { PatientRequest } from '../entities/patient_requests.entity';
import { AddCallStatusDto } from '../../call-history/dto/add-call-status.dto';
import { CallHistoryService } from '../../call-history/call-history.service';
import { FeedbacksService } from '../../feedbacks/feedbacks.service';
import { CreateFeedbackDto } from 'src/modules/feedbacks/dto/create-feedback.dto';
import { RequestStatus } from 'src/common/enums/request-status.enum';

@Injectable()
export class RequestActionsService {
  private readonly logger = new Logger(RequestActionsService.name);

  constructor(
    @InjectRepository(PatientRequest)
    private requestRepository: Repository<PatientRequest>,
    private readonly callHistoryService: CallHistoryService,
    private readonly feedbacksService: FeedbacksService,
  ) {}

  async addCallStatus(
    requestId: string,
    dto: AddCallStatusDto,
    operatorId: string,
  ) {
    if (!operatorId) {
      throw new InternalServerErrorException(
        'Operator ID is missing inside Service',
      );
    }
    return this.callHistoryService.create(requestId, dto, operatorId);
  }

  async addFeedback(
    requestId: string,
    dto: CreateFeedbackDto,
    operatorId: string,
    type: 'complaint' | 'suggestion', 
  ) {
    if (!operatorId) {
      throw new InternalServerErrorException(
        'Operator ID is missing inside Service',
      );
    }

    if (type === 'complaint') {
      return this.feedbacksService.createComplaint(requestId, dto, operatorId);
    } else {
      return this.feedbacksService.createSuggestion(requestId, dto, operatorId);
    }
  }

  async markAsAllOk(requestId: string, operatorId: string) {
    if (!operatorId) {
      throw new InternalServerErrorException(
        'Operator ID is missing inside Service',
      );
    }

    const request = await this.requestRepository.findOne({
      where: { id: requestId },
    });

    if (!request) {
      throw new NotFoundException('Заявка не найдена');
    }

    return this.callHistoryService.create(
      requestId,
      {
        status: RequestStatus.ALL_OK, 
        note: "Hammasi joyida (Shikoyat yo'q)", 
      },
      operatorId,
    );
  }
  async revertStatus(requestId: string) {
    const request = await this.requestRepository.findOne({
      where: { id: requestId },
      relations: ['callStatus', 'feedback'],
    });

    if (!request) {
      throw new NotFoundException('Заявка не найдена');
    }

    const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;
    const timeDiff = new Date().getTime() - new Date(request.updatedAt).getTime();

    if (timeDiff > ONE_WEEK_MS) {
      throw new BadRequestException(
        "Statusni qaytarish muddati (1 hafta) o'tib ketgan",
      );
    }

    if (request.feedback) {
      await this.feedbacksService.revertFeedback(request.feedback.id);
      this.logger.log(`Reverted Feedback ${request.feedback.id} for Request ${requestId}`);
      
      return {
        message: "Otzyv bekor qilindi, status CONTACTED ga qaytarildi",
        status: 'contacted',
      };
    } 
    
    if (request.callStatus) {
      await this.callHistoryService.revert(request.callStatus.id);
      this.logger.log(`Reverted CallStatus ${request.callStatus.id} for Request ${requestId}`);
      
      return {
        message: "Qo'ng'iroq bekor qilindi, status NEW ga qaytarildi",
        status: 'new',
      };
    }

    throw new BadRequestException("Ushbu arizada bekor qilish uchun harakatlar yo'q");
  }
}