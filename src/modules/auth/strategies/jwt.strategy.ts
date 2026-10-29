import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UsersService } from 'src/modules/users/users.service';
import { getJwtSecret } from 'src/common/utils/jwt-secret.util';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private usersService: UsersService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: getJwtSecret(configService),
    });
  }

  async validate(payload: any) {
    if (!payload.sub) throw new UnauthorizedException();
    const user = await this.usersService.findActiveById(payload.sub);
    if (!user || (payload.tokenVersion ?? 0) !== user.tokenVersion) {
      throw new UnauthorizedException();
    }
    return { id: user.id, phone: user.phone, role: user.role };
  }
}
