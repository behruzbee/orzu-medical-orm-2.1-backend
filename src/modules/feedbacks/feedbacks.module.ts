import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FeedbacksService } from './feedbacks.service';
import { FeedbacksController } from './feedbacks.controller';
import { Feedback } from './entities/feedback.entity';
import { EvidenceMessage } from './entities/evidence-message.entity';
import { TrelloModule } from '../trello/trello.module';
import { PatientRequest } from '../patients/entities/patient_requests.entity';
import { FeedbackSubcategory } from './entities/feedback-subcategory.entity';
import { ArchiveModule } from '../archive/archive.module';
import { PublicFeedbackController } from './public-feedback.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Feedback,
      FeedbackSubcategory,
      EvidenceMessage,
      PatientRequest,
    ]),
    TrelloModule,
    ArchiveModule,
  ],
  controllers: [FeedbacksController, PublicFeedbackController],
  providers: [FeedbacksService],
  exports: [FeedbacksService],
})
export class FeedbacksModule {}
