import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Sse,
  Get,
  UseGuards,
  Req,
  ConflictException,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { LoginDto } from './dto/login.dto';
import { Observable, map } from 'rxjs';
import { AuthGuard } from '@nestjs/passport';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly whatsappService: WhatsappService,
  ) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Get('me')
  @UseGuards(AuthGuard('jwt'))
  getProfile(@Req() req) {
    return req.user;
  }

  @Sse('qr-stream')
  streamQr(): Observable<any> {
    if (this.whatsappService.isSessionActive()) {
      throw new ConflictException({
        message: 'Tizimda allaqachon faol WhatsApp sessiyasi mavjud.',
        code: 'SESSION_ALREADY_ACTIVE',
      });
    }
    return this.whatsappService.getQrStream().pipe(map((data) => ({ data })));
  }
}
