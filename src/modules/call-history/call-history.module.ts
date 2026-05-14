import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CallHistoryService } from './call-history.service';
import { CallStatus } from './entities/call-status.entity';
import { PatientRequest } from '../patients/entities/patient_requests.entity'; 

@Module({
  imports: [TypeOrmModule.forFeature([CallStatus, PatientRequest])],
  providers: [CallHistoryService],
  exports: [CallHistoryService], 
})
export class CallHistoryModule {}