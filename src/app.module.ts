import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from './database/database.module';
import { UsersModule } from './modules/users/users.module';
import { AuthModule } from './modules/auth/auth.module';
import { CallHistoryModule } from './modules/call-history/call-history.module';
import { FeedbacksModule } from './modules/feedbacks/feedbacks.module';
import { PatientsModule } from './modules/patients/patients.module';
import { ReportsModule } from './modules/reports/reports.module';
import { TrelloModule } from './modules/trello/trello.module';
import { TelegramModule } from './modules/telegram/telegram.module';
import { ScheduleModule } from '@nestjs/schedule';
import { DoctorMessagesModule } from './modules/doctor-messages/doctor-messages.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    ScheduleModule.forRoot(),
    DatabaseModule,
    UsersModule,
    AuthModule,
    CallHistoryModule,
    FeedbacksModule,
    PatientsModule,
    ReportsModule,
    TrelloModule,
    TelegramModule,
    DoctorMessagesModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
