import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const apiKey = request.headers['x-api-key']; 
    const validKey = this.configService.get<string>('EXTERNAL_API_KEY');

    if (!apiKey || apiKey !== validKey) {
      throw new UnauthorizedException('Invalid API Key');
    }

    return true;
  }
}