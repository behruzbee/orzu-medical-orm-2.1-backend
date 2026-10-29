import { ConfigService } from '@nestjs/config';

export function getJwtSecret(config: ConfigService): string {
  const secret = config.get<string>('JWT_SECRET');
  if (!secret || ['default_secret_key', 'change-me'].includes(secret)) {
    throw new Error('JWT_SECRET must be configured with a private value');
  }
  return secret;
}
