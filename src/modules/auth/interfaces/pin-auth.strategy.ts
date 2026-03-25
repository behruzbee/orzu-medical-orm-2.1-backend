import {
  Injectable,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { IAuthStrategy } from '../interfaces/auth-strategy.interface';
import { LoginDto } from '../dto/login.dto';
import { UsersService } from 'src/modules/users/users.service';

@Injectable()
export class PinAuthStrategy implements IAuthStrategy {
  constructor(private readonly usersService: UsersService) {}

  async validate(dto: LoginDto) {
    if (!dto.phone || !dto.pin) {
      throw new UnauthorizedException(
        'Telefon raqam va PIN kod kiritilishi shart',
      );
    }

    const user = await this.usersService.findOneByPhone(dto.phone);

    if (!user) {
      throw new UnauthorizedException("Login yoki parol noto'g'ri");
    }

    if (!user.isActive) {
      throw new ForbiddenException('Akkaunt bloklangan');
    }

    if (user.pin !== dto.pin) {
      throw new UnauthorizedException("Login yoki parol noto'g'ri");
    }

    return user;
  }
}
