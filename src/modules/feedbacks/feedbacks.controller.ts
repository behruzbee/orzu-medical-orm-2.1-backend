import { Controller, Get, UseGuards } from '@nestjs/common';
import { FeedbacksService } from './feedbacks.service';
import { AuthGuard } from '@nestjs/passport';

@Controller('feedbacks')
@UseGuards(AuthGuard('jwt'))
export class FeedbacksController {
  constructor(private readonly feedbacksService: FeedbacksService) {}

  @Get()
  getAllFeedbacks() {
    return this.feedbacksService.findAll();
  }
}