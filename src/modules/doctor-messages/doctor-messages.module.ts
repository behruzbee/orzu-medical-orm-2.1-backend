import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule, JwtModuleOptions } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PatientRequest } from 'src/modules/patients/entities/patient_requests.entity';
import { DoctorMessagesController } from './doctor-messages.controller';
import { DoctorMessagesService } from './doctor-messages.service';
import { DoctorPatientMessage } from './entities/doctor-patient-message.entity';
import { getJwtSecret } from 'src/common/utils/jwt-secret.util';
import { UsersModule } from 'src/modules/users/users.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([DoctorPatientMessage, PatientRequest]),
    UsersModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService): JwtModuleOptions => {
        const secret = getJwtSecret(config);
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
