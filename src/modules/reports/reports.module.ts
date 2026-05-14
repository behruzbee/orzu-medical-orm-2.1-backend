import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReportsController } from './reports.controller';
import { Report } from './entities/report.entity';
import { Patient } from '../patients/entities/patient.entity';
import { ReportsService } from './reports.service';
import { PatientRequest } from '../patients/entities/patient_requests.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Report, Patient, PatientRequest])],
  controllers: [ReportsController],
  providers: [ReportsService]
})
export class ReportsModule {}
