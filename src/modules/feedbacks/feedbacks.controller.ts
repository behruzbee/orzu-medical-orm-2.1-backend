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

  // 1. Простая карта расширений на основе вашего FilesService
  const extensionMap: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'audio/mpeg': 'mp3',
    'audio/mp3': 'mp3',
    'audio/webm': 'webm',
    'audio/ogg': 'ogg',
    'audio/wav': 'wav',
    'video/mp4': 'mp4',
    'video/webm': 'webm',
    'application/pdf': 'pdf',
  };

  let ext = 'bin';
  if (evidence.mimeType) {
    ext = extensionMap[evidence.mimeType] || evidence.mimeType.split('/')[1]?.split('+')[0] || 'bin';
  }

  res.set({
    'Content-Type': evidence.mimeType || 'application/octet-stream',
    'Content-Disposition': `inline; filename="evidence-${id}.${ext}"`,
    'Cache-Control': 'public, max-age=2592000',
  });

  return new StreamableFile(evidence.mediaData);
}
}