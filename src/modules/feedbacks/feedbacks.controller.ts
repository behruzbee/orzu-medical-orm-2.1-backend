import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  Res,
  UseGuards,
  StreamableFile,
} from '@nestjs/common';
import { Response } from 'express';
import { FeedbacksService } from './feedbacks.service';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CreateSubcategoryDto } from './dto/create-subcategory.dto';
import { AnalyticsQueryDto } from './dto/analytics-query.dto';

@ApiTags('Feedbacks')
@Controller('feedbacks')
export class FeedbacksController {
  constructor(private readonly feedbacksService: FeedbacksService) {}

  @Get()
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth('jwt')
  @ApiOperation({ summary: 'Get all feedback records' })
  getAllFeedbacks() {
    return this.feedbacksService.findAll();
  }

  @Get('analytics')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth('jwt')
  @ApiOperation({ summary: 'Get live feedback BI analytics' })
  getAnalytics(@Query() query: AnalyticsQueryDto) {
    return this.feedbacksService.getAnalytics(query.dateFrom, query.dateTo);
  }

  @Get('subcategories')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth('jwt')
  @ApiOperation({ summary: 'Get feedback subcategory dictionary' })
  getSubcategories(
    @Query('type') type?: string,
    @Query('category') category?: string,
  ) {
    return this.feedbacksService.findSubcategories(type, category);
  }

  @Post('subcategories')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth('jwt')
  @ApiOperation({ summary: 'Add a reusable feedback subcategory' })
  createSubcategory(@Body() dto: CreateSubcategoryDto) {
    return this.feedbacksService.createSubcategory(dto);
  }

  @Get('evidence/:id/file')
  @ApiOperation({ summary: 'Get evidence media file' })
  async getFile(@Param('id') id: string, @Res({ passthrough: true }) res) {
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
      ext =
        extensionMap[evidence.mimeType] ||
        evidence.mimeType.split('/')[1]?.split('+')[0] ||
        'bin';
    }

    res.set({
      'Content-Type': evidence.mimeType || 'application/octet-stream',
      'Content-Disposition': `inline; filename="evidence-${id}.${ext}"`,
      'Cache-Control': 'public, max-age=2592000',
    });

    return new StreamableFile(evidence.mediaData);
  }
}
