import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CallHistoryService } from './call-history.service';
import { CallHistoryController } from './call-history.controller';
import { CallStatus } from './entities/call-status.entity';

@Module({
  imports: [TypeOrmModule.forFeature([CallStatus])],
  controllers: [CallHistoryController],
  providers: [CallHistoryService],
  exports: [CallHistoryService],
})
export class CallHistoryModule {}
