import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  UseGuards,
  BadRequestException,
  Req,
} from '@nestjs/common';
import { WhatsappService } from './whatsapp.service';
import { AuthGuard } from '@nestjs/passport';

@Controller('whatsapp')
@UseGuards(AuthGuard('jwt'))
export class WhatsappController {
  constructor(private readonly whatsappService: WhatsappService) {}

  @Get('history')
  async getHistory(@Query('phone') phone: string) {
    if (!phone) throw new BadRequestException('Phone is required');
    return this.whatsappService.getChatHistory(phone);
  }

  @Post('send')
  async sendMessage(@Body() body: { phone: string; text: string }) {
    await this.whatsappService.sendText(body.phone, body.text);
    return { success: true };
  }
}
