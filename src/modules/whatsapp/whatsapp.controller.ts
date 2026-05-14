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
import { BroadcastDto } from './dto/broadcast.dto';

@Controller('whatsapp')
@UseGuards(AuthGuard('jwt'))
export class WhatsappController {
  constructor(private readonly whatsappService: WhatsappService) {}

  @Get('history')
  async getHistory(@Query('phone') phone: string) {
    if (!phone) throw new BadRequestException('Phone is required');
    return this.whatsappService.getChatHistory(phone);
  }

  @Post('broadcast')
  async broadcast(@Body() dto: BroadcastDto) {
    return this.whatsappService.broadcastByFilters(dto);
  }

  // 👈 Accept optional requestId
  @Post('send')
  async sendMessage(@Body() body: { phone: string; text: string; requestId?: string }) {
    await this.whatsappService.sendText(body.phone, body.text, body.requestId);
    return { success: true };
  }
}