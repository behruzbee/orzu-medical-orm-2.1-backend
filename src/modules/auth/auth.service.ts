import { Injectable, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { QrAuthStrategy } from './strategies/qr-auth.strategy';
import { LoginDto } from './dto/login.dto';
import { PinAuthStrategy } from './interfaces/pin-auth.strategy';

@Injectable()
export class AuthService {
  constructor(
    private jwtService: JwtService,
    private pinStrategy: PinAuthStrategy,
    private qrStrategy: QrAuthStrategy,
  ) {}

  async login(dto: LoginDto) {
    let user;

    switch (dto.method) {
      case 'pin':
        user = await this.pinStrategy.validate(dto);
        break;

      case 'qr':
        user = await this.qrStrategy.validate();
        break;

      default:
        throw new BadRequestException('Noto\'g\'ri kirish usuli');
    }

    const payload = { 
      sub: user.id, 
      phone: user.phone, 
      role: user.role 
    };

    return {
      accessToken: this.jwtService.sign(payload),
      user: {
        id: user.id,
        name: user.name,
        role: user.role,
        avatar: user.avatar,
      },
    };
  }
}