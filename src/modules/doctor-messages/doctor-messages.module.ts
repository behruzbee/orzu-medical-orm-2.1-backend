import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule, JwtModuleOptions } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PatientRequest } from 'src/modules/patients/entities/patient_requests.entity';
import { DoctorMessagesController } from './doctor-messages.controller';
import { DoctorMessagesService } from './doctor-messages.service';
import { DoctorPatientMessage } from './entities/doctor-patient-message.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([DoctorPatientMessage, PatientRequest]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService): JwtModuleOptions => {
        const secret = config.get<string>('JWT_SECRET') || 'default_secret_key';
        const expiresIn = config.get<string>('JWT_EXPIRES_IN') || '1d';

        return {
          secret,
          signOptions: {
            expiresIn: expiresIn as unknown as any,
          },
        } as JwtModuleOptions;
      },
    }),
  ],
  controllers: [DoctorMessagesController],
  providers: [DoctorMessagesService],
})
export class DoctorMessagesModule {}
