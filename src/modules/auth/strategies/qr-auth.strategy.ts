import { Injectable, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { UsersService } from '../../users/users.service';
import { WhatsappService } from '../../whatsapp/whatsapp.service';
import { IAuthStrategy } from '../interfaces/auth-strategy.interface';

@Injectable()
export class QrAuthStrategy implements IAuthStrategy {
  constructor(
    private readonly usersService: UsersService,
    private readonly whatsappService: WhatsappService,
  ) {}

  async validate() {
    const activePhone = this.whatsappService.getCurrentUserPhone();

    if (!activePhone) {
      throw new UnauthorizedException('WhatsApp sessiyasi topilmadi. Iltimos, QR kodni skanerlang.');
    }

    const formattedPhone = '+' + activePhone;

    const user = await this.usersService.findOneByPhone(formattedPhone);

    if (!user) {
      throw new UnauthorizedException(`Ushbu WhatsApp raqami (${formattedPhone}) tizimda ro'yxatdan o'tmagan.`);
    }

    if (!user.isActive) {
      throw new ForbiddenException('Akkaunt bloklangan');
    }

    return user;
  }
}