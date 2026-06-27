import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'crypto';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const apiKeyHeader = request.headers['x-api-key'];
    const apiKey = Array.isArray(apiKeyHeader) ? apiKeyHeader[0] : apiKeyHeader;
    const validKeys = this.getValidKeys();

    if (
      !apiKey ||
      !validKeys.some((validKey) => this.matches(apiKey, validKey))
    ) {
      throw new UnauthorizedException('Invalid API Key');
    }

    return true;
  }

  private getValidKeys(): string[] {
    const rawKeys = [
      this.configService.get<string>('INTEGRATION_API_KEYS'),
      this.configService.get<string>('EXTERNAL_API_KEYS'),
      this.configService.get<string>('EXTERNAL_API_KEY'),
    ];

    return rawKeys
      .flatMap((value) => (value || '').split(','))
      .map((value) => value.trim())
      .filter(Boolean);
  }

  private matches(apiKey: string, validKey: string): boolean {
    const candidate = Buffer.from(apiKey);
    const expected = Buffer.from(validKey);

    return (
      candidate.length === expected.length &&
      timingSafeEqual(candidate, expected)
    );
  }
}
