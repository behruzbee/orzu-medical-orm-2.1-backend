import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReportsService } from './reports.service';
import { ReportsController } from './reports.controller';
import { Report } from './entities/report.entity';
import { Patient } from '../patients/entities/patient.entity';
import { FilesModule } from '../files/files.module';

@Module({
  imports: [TypeOrmModule.forFeature([Report, Patient]), FilesModule],
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}
