import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FeedbacksService } from './feedbacks.service';
import { FeedbacksController } from './feedbacks.controller';
import { Feedback } from './entities/feedback.entity';
import { EvidenceMessage } from './entities/evidence-message.entity';
import { TrelloModule } from '../trello/trello.module';
import { PatientRequest } from '../patients/entities/patient_requests.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Feedback, EvidenceMessage, PatientRequest]),
    TrelloModule,
  ],
  controllers: [FeedbacksController],
  providers: [FeedbacksService],
  exports: [FeedbacksService],
})
export class FeedbacksModule {}
