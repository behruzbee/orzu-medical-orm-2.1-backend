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
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

@ApiTags('WhatsApp')
@ApiBearerAuth('jwt')
@Controller('whatsapp')
@UseGuards(AuthGuard('jwt'))
export class WhatsappController {
  constructor(private readonly whatsappService: WhatsappService) {}

  @Get('history')
  @ApiOperation({ summary: 'Get WhatsApp chat history by phone' })
  async getHistory(@Query('phone') phone: string) {
    if (!phone) throw new BadRequestException('Phone is required');
    return this.whatsappService.getChatHistory(phone);
  }

  @Post('broadcast')
  @ApiOperation({ summary: 'Send WhatsApp broadcast by filters' })
  async broadcast(@Body() dto: BroadcastDto) {
    return this.whatsappService.broadcastByFilters(dto);
  }

  // 👈 Accept optional requestId
  @Post('send')
  @ApiOperation({ summary: 'Send WhatsApp text message' })
  async sendMessage(
    @Body() body: { phone: string; text: string; requestId?: string },
  ) {
    await this.whatsappService.sendText(body.phone, body.text, body.requestId);
    return { success: true };
  }
}
