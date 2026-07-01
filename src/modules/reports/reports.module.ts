import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReportsController } from './reports.controller';
import { Report } from './entities/report.entity';
import { Patient } from '../patients/entities/patient.entity';
import { ReportsService } from './reports.service';
import { PatientRequest } from '../patients/entities/patient_requests.entity';
import { ImportErrorLog } from '../patients/entities/import-error-log.entity';
import { ReportStatsService } from 'src/common/report-stats/report-stats.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Report, Patient, PatientRequest, ImportErrorLog]),
  ],
  controllers: [ReportsController],
  providers: [ReportsService, ReportStatsService],
})
export class ReportsModule {}
