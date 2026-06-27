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
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly whatsappService: WhatsappService,
  ) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Login by operator PIN or active WhatsApp QR session',
  })
  @ApiOkResponse({ description: 'JWT token and user profile.' })
  async login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Get('me')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth('jwt')
  @ApiOperation({ summary: 'Get current authenticated user' })
  getProfile(@Req() req) {
    return req.user;
  }

  @Sse('qr-stream')
  @ApiOperation({ summary: 'Stream WhatsApp QR code events' })
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
