import {
  Injectable,
  UnauthorizedException,
  ForbiddenException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { IAuthStrategy } from '../interfaces/auth-strategy.interface';
import { LoginDto } from '../dto/login.dto';
import { UsersService } from 'src/modules/users/users.service';
import { verifyPin } from 'src/common/utils/pin.util';

@Injectable()
export class PinAuthStrategy implements IAuthStrategy {
  private readonly attempts = new Map<
    string,
    { count: number; expiresAt: number }
  >();

  constructor(private readonly usersService: UsersService) {}

  async validate(dto: LoginDto) {
    if (!dto.phone || !dto.pin) {
      throw new UnauthorizedException(
        'Telefon raqam va PIN kod kiritilishi shart',
      );
    }

    const phone = dto.phone;
    const now = Date.now();
    const attempt = this.attempts.get(phone);
    if (attempt && attempt.expiresAt > now && attempt.count >= 5) {
      throw new HttpException(
        'Too many login attempts',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    if (attempt && attempt.expiresAt <= now) this.attempts.delete(phone);

    const user = await this.usersService.findForLogin(phone);

    if (!user) {
      this.recordFailure(phone);
      throw new UnauthorizedException("Login yoki parol noto'g'ri");
    }

    if (!user.isActive) {
      throw new ForbiddenException('Akkaunt bloklangan');
    }

    if (!verifyPin(dto.pin, user.pin)) {
      this.recordFailure(phone);
      throw new UnauthorizedException("Login yoki parol noto'g'ri");
    }

    this.attempts.delete(phone);

    if (!user.pin.startsWith('scrypt$')) {
      await this.usersService.replacePin(user.id, dto.pin);
      user.tokenVersion += 1;
    }

    return user;
  }

  private recordFailure(phone: string) {
    const now = Date.now();
    const current = this.attempts.get(phone);
    this.attempts.set(phone, {
      count: current && current.expiresAt > now ? current.count + 1 : 1,
      expiresAt:
        current && current.expiresAt > now
          ? current.expiresAt
          : now + 15 * 60_000,
    });
  }
}
