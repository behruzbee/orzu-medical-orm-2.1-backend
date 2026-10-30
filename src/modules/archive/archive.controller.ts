import {
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AdminGuard } from '../../common/guards/admin.guard';
import { ArchiveService } from './archive.service';

const mediaTypes = new Map([
  ['audio/ogg', 'ogg'],
  ['audio/mpeg', 'mp3'],
  ['audio/mp3', 'mp3'],
  ['audio/wav', 'wav'],
  ['audio/webm', 'webm'],
  ['audio/mp4', 'm4a'],
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['video/mp4', 'mp4'],
  ['video/webm', 'webm'],
  ['application/pdf', 'pdf'],
]);

@ApiTags('Archive')
@ApiBearerAuth('jwt')
@UseGuards(AuthGuard('jwt'), AdminGuard)
@Controller('archive/:source/feedbacks/:feedbackId/evidence')
export class ArchiveController {
  constructor(private readonly archive: ArchiveService) {}

  @Get(':id')
  @Header('Cache-Control', 'no-store, private')
  metadata(
    @Param('source') source: string,
    @Param('feedbackId', new ParseUUIDPipe()) feedbackId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.archive.evidence(source, feedbackId, id);
  }

  @Get(':id/file')
  async download(
    @Param('source') source: string,
    @Param('feedbackId', new ParseUUIDPipe()) feedbackId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Res({ passthrough: true }) res,
  ) {
    const record = await this.archive.evidence(source, feedbackId, id, true);
    const suppliedType = String(record.mimeType || '')
      .split(';')[0]
      .toLowerCase();
    const mimeType = mediaTypes.has(suppliedType)
      ? suppliedType
      : 'application/octet-stream';
    res.set({
      'Content-Type': mimeType,
      'Content-Disposition': `attachment; filename="${source}-${id}.${mediaTypes.get(mimeType) || 'bin'}"`,
      'Cache-Control': 'no-store, private',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
    });
    return new StreamableFile(record.data);
  }
}
