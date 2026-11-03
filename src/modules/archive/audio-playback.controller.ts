import {
  Body,
  CanActivate,
  Controller,
  ExecutionContext,
  ForbiddenException,
  Get,
  Injectable,
  Param,
  Post,
  Req,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsIn, IsString, IsUUID, Matches } from 'class-validator';
import { AdminGuard } from '../../common/guards/admin.guard';
import { AudioPlaybackService } from './audio-playback.service';
import { audioHeaders } from './audio-policy';
import { sendPublicAudio } from './public-audio-response';

class AudioTargetDto {
  @IsIn(['v1', 'v2', 'v21']) source: string;
  @IsUUID() feedbackId: string;
  @IsUUID() id: string;
}
class AudioTokenDto {
  @IsString() @Matches(/^[A-Za-z0-9_-]{43}$/) token: string;
}

@Injectable()
export class AudioOriginGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}
  canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest();
    const res = context.switchToHttp().getResponse();
    res.set(audioHeaders);
    const origin = this.config.get<string>('FRONTEND_URL');
    if (
      !origin ||
      req.headers.origin !== new URL(origin).origin ||
      req.headers['x-audio-playback'] !== '1' ||
      req.headers.range ||
      !String(req.headers['content-type'] || '').startsWith('application/json')
    ) {
      throw new ForbiddenException('Playback request denied');
    }
    return true;
  }
}

@ApiTags('Audio playback')
@ApiBearerAuth('jwt')
@UseGuards(AudioOriginGuard, AuthGuard('jwt'))
@Controller('audio-playback')
export class AudioPlaybackController {
  constructor(private readonly audio: AudioPlaybackService) {}

  @Post('archive/tickets')
  @UseGuards(AdminGuard)
  issueArchive(@Req() req, @Body() body: AudioTargetDto) {
    return this.audio.issue(req.user.id, body.source, body.feedbackId, body.id);
  }

  @Post('current/tickets')
  issueCurrent(@Req() req, @Body() body: AudioTargetDto) {
    if (body.source !== 'v21')
      throw new ForbiddenException('Current evidence only');
    return this.audio.issue(
      req.user.id,
      'v21',
      body.feedbackId,
      body.id,
      false,
    );
  }

  @Post('play')
  async play(
    @Req() req,
    @Body() body: AudioTokenDto,
    @Res({ passthrough: true }) res,
  ) {
    const record = await this.audio.play(
      req.user.id,
      body.token,
      req.user.role === 'admin',
    );
    res.set({
      ...audioHeaders,
      'Content-Type': record.mimeType,
      'Content-Disposition': 'inline',
    });
    return new StreamableFile(record.data);
  }

  @Post('revoke')
  revoke(@Req() req) {
    return this.audio.revoke(req.user.id);
  }

  @Post('shares')
  @UseGuards(AdminGuard)
  share(@Req() req, @Body() body: AudioTargetDto) {
    return this.audio.share(req.user.id, body.source, body.feedbackId, body.id);
  }

  @Post('shares/revoke')
  @UseGuards(AdminGuard)
  revokeShare(@Req() req, @Body() body: AudioTokenDto) {
    return this.audio.revokeShare(req.user.id, body.token);
  }
}

@ApiTags('Audio playback')
@UseGuards(AudioOriginGuard)
@Controller('audio-guest')
export class AudioGuestController {
  constructor(private readonly audio: AudioPlaybackService) {}

  @Post('status')
  async status(@Req() req, @Body() body: AudioTokenDto) {
    await this.audio.guestLimit(
      req.socket.remoteAddress || 'unknown',
      body.token,
    );
    return this.audio.guestStatus(body.token);
  }

  @Post('play')
  async play(
    @Req() req,
    @Body() body: AudioTokenDto,
    @Res({ passthrough: true }) res,
  ) {
    await this.audio.guestLimit(
      req.socket.remoteAddress || 'unknown',
      body.token,
    );
    const record = await this.audio.guestPlay(body.token);
    res.set({
      ...audioHeaders,
      'Content-Type': record.mimeType,
      'Content-Disposition': 'inline',
    });
    return new StreamableFile(record.data);
  }
}

@ApiTags('Public audio playback')
@Controller('public/audio')
export class PublicAudioController {
  constructor(private readonly audio: AudioPlaybackService) {}

  @Get(':token')
  async open(@Param('token') token: string, @Res() res) {
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw new ForbiddenException('Audio link unavailable');
    const status = await this.audio.guestStatus(token);
    if (!status.available) throw new ForbiddenException('Audio link unavailable');
    res.set({
      ...audioHeaders,
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Security-Policy': "default-src 'none'; media-src 'self'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'",
    });
    res.send(`<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Orzu Medical — голосовое сообщение</title><style>body{font:18px/1.5 Arial;background:#f4f7f5;color:#17211d;margin:0;padding:24px}main{max-width:640px;margin:8vh auto;padding:28px;background:white;border-radius:18px}h1{color:#168c36;font-size:26px}audio{width:100%;margin:20px 0}</style></head><body><main><h1>Orzu Medical</h1><h2>Голосовое сообщение</h2><audio controls preload="metadata" src="${token}/file"></audio><p>Нажмите ▶ для прослушивания.</p></main></body></html>`);
  }

  @Get(':token/file')
  async play(
    @Param('token') token: string,
    @Req() req,
    @Res() res,
  ) {
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) {
      throw new ForbiddenException('Audio link unavailable');
    }
    await this.audio.guestLimit(req.socket.remoteAddress || 'unknown', token);
    const record = await this.audio.guestPlay(token);
    return sendPublicAudio(res, record, req.headers.range);
  }
}
