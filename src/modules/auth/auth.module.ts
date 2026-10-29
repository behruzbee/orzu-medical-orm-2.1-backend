import { Module } from '@nestjs/common';
import { JwtModule, JwtModuleOptions } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PassportModule } from '@nestjs/passport';

import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './strategies/jwt.strategy';

import { UsersModule } from '../users/users.module';
import { PinAuthStrategy } from './strategies/pin-auth.strategy';
import { getJwtSecret } from 'src/common/utils/jwt-secret.util';

@Module({
  imports: [
    UsersModule,
    PassportModule,
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
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, PinAuthStrategy],
  exports: [AuthService],
})
export class AuthModule {}
