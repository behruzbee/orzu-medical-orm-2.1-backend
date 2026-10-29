import { INestApplicationContext, Logger } from '@nestjs/common';
import { UsersService } from './modules/users/users.service';

export async function runSeed(app: INestApplicationContext) {
  const phone = process.env.BOOTSTRAP_ADMIN_PHONE;
  const pin = process.env.BOOTSTRAP_ADMIN_PIN;
  if (!phone && !pin) return;

  const logger = new Logger('SeedData');
  if (!phone || !pin || !/^\+998\d{9}$/.test(phone) || !/^\d{5}$/.test(pin)) {
    logger.error('Bootstrap admin requires a valid phone and 5-digit PIN');
    return;
  }

  const usersService = app.get(UsersService);
  if (await usersService.findOneByPhone(phone)) return;

  await usersService.create({
    name: 'Admin',
    phone,
    pin,
    role: 'admin',
  } as any);
  logger.log('Bootstrap admin created');
}
