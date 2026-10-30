import { Module } from '@nestjs/common';
import { ArchiveController } from './archive.controller';
import { ArchiveService } from './archive.service';
import { AudioPlaybackService } from './audio-playback.service';
import {
  AudioOriginGuard,
  AudioPlaybackController,
  AudioGuestController,
} from './audio-playback.controller';

@Module({
  controllers: [
    ArchiveController,
    AudioPlaybackController,
    AudioGuestController,
  ],
  providers: [ArchiveService, AudioPlaybackService, AudioOriginGuard],
  exports: [AudioPlaybackService],
})
export class ArchiveModule {}
