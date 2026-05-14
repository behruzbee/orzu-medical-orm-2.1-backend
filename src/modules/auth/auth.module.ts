import { Module } from '@nestjs/common';
import { JwtModule, JwtModuleOptions } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PassportModule } from '@nestjs/passport';

import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './strategies/jwt.strategy';
import { QrAuthStrategy } from './strategies/qr-auth.strategy';

import { UsersModule } from '../users/users.module';
import { WhatsappModule } from '../whatsapp/whatsapp.module';
import { PinAuthStrategy } from './strategies/pin-auth.strategy';

@Module({
  imports: [
    UsersModule,
    WhatsappModule,
    PassportModule,
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
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, PinAuthStrategy, QrAuthStrategy],
  exports: [AuthService],
})
export class AuthModule {}
