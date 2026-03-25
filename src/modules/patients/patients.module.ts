import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Patient } from './entities/patient.entity';

import { PatientsController } from './patients.controller';

import { PatientsService } from './services/patients.service';
import { PatientsImportService } from './services/patients-import.service';
import { PatientActionsService } from './services/patient-actions.service';
import { PatientsStatsService } from './services/patients-stats.service';

import { FilesModule } from '../files/files.module';
import { TrelloModule } from '../trello/trello.module';

@Module({
  imports: [TypeOrmModule.forFeature([Patient]), FilesModule, TrelloModule],
  controllers: [PatientsController],
  providers: [
    PatientsService,
    PatientsImportService,
    PatientActionsService,
    PatientsStatsService,
  ],
  exports: [PatientsService],
})
export class PatientsModule {}
