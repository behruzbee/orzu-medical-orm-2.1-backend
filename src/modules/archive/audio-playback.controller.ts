import {
  Body,
  CanActivate,
  Controller,
  ExecutionContext,
  ForbiddenException,
  Injectable,
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
