import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FeedbacksService } from './feedbacks.service';
import { FeedbacksController } from './feedbacks.controller';
import { Feedback } from './entities/feedback.entity';
import { EvidenceMessage } from './entities/evidence-message.entity';
import { FilesModule } from '../files/files.module';
import { TrelloModule } from '../trello/trello.module';

@Module({
  imports: [TypeOrmModule.forFeature([Feedback, EvidenceMessage]), FilesModule, TrelloModule],
  controllers: [FeedbacksController],
  providers: [FeedbacksService],
  exports: [FeedbacksService],
})
export class FeedbacksModule {}
