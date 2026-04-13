import { 
  Controller, 
  Get, 
  Param, 
  Res, 
  UseGuards, 
  StreamableFile 
} from '@nestjs/common';
import { Response } from 'express';
import { FeedbacksService } from './feedbacks.service';
import { AuthGuard } from '@nestjs/passport';

@Controller('feedbacks')
export class FeedbacksController {
  constructor(private readonly feedbacksService: FeedbacksService) {}

  @Get()
  @UseGuards(AuthGuard('jwt'))
  getAllFeedbacks() {
    return this.feedbacksService.findAll();
  }

  @Get('evidence/:id/file')
  async getFile(
    @Param('id') id: string, 
    @Res({ passthrough: true }) res
  ) {
    const evidence = await this.feedbacksService.getEvidenceFile(id);

    res.set({
      'Content-Type': evidence.mimeType || 'application/octet-stream',
      'Content-Disposition': `inline; filename="evidence-${id}"`,
      'Cache-Control': 'public, max-age=2592000',
    });

    return new StreamableFile(evidence.mediaData);
  }
}