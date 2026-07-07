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
    const rawApiKey = Array.isArray(apiKeyHeader)
      ? apiKeyHeader[0]
      : apiKeyHeader;
    const apiKey = this.normalizeApiKey(rawApiKey);
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
      this.configService.get<string>('INTEGRATION_API_KEY'),
      this.configService.get<string>('INTEGRATION_API_KEYS'),
      this.configService.get<string>('REPORT_STATS_API_KEY'),
      this.configService.get<string>('EXTERNAL_API_KEYS'),
      this.configService.get<string>('EXTERNAL_API_KEY'),
      this.configService.get<string>('API_KEY'),
      this.configService.get<string>('API_KEYS'),
      this.configService.get<string>('X_API_KEY'),
      this.configService.get<string>('X_API_KEYS'),
    ];

    return rawKeys
      .flatMap((value) => (value || '').split(','))
      .map((value) => this.normalizeApiKey(value))
      .filter(Boolean);
  }

  private normalizeApiKey(value?: string): string {
    return (value || '')
      .trim()
      .replace(/^x-api-key:\s*/i, '')
      .replace(/^api-key:\s*/i, '')
      .replace(/^apikey\s+/i, '')
      .replace(/^bearer\s+/i, '')
      .trim();
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
