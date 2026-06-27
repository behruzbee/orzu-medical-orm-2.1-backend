import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Patient } from './entities/patient.entity';

import { RequestsController } from './requests.controller';
import { IntegrationController } from './integration.controller';

import { PatientsService } from './services/patients.service';
import { PatientsImportService } from './services/patients-import.service';
import { RequestActionsService } from './services/request-actions.service';
import { PatientsStatsService } from './services/patients-stats.service';

import { TrelloModule } from '../trello/trello.module';
import { PatientRequest } from './entities/patient_requests.entity';
import { PatientImportTemp } from './entities/patient-import-temp.entity';
import { CallHistoryModule } from '../call-history/call-history.module';
import { FeedbacksModule } from '../feedbacks/feedbacks.module';
import { ImportErrorLog } from './entities/import-error-log.entity';
import { ApiKeyGuard } from 'src/common/guards/api-keys.guard';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Patient,
      PatientRequest,
      PatientImportTemp,
      ImportErrorLog,
    ]),
    TrelloModule,
    CallHistoryModule,
    FeedbacksModule,
  ],
  controllers: [RequestsController, IntegrationController],
  providers: [
    PatientsService,
    PatientsImportService,
    RequestActionsService,
    PatientsStatsService,
    ApiKeyGuard,
  ],
  exports: [PatientsService],
})
export class PatientsModule {}
