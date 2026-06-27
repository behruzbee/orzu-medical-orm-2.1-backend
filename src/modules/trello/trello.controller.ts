import { Controller, Post, Get, Body, HttpCode, Logger } from '@nestjs/common';
import { TrelloService } from './services/trello.service';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

@ApiTags('Trello')
@Controller('trello')
export class TrelloController {
  private readonly logger = new Logger(TrelloController.name);

  constructor(private readonly trelloService: TrelloService) {}

  @Get('webhook')
  @ApiOperation({ summary: 'Verify Trello webhook URL' })
  verifyWebhook() {
    this.logger.log('Trello проверил Webhook URL');
    return 'OK';
  }

  @Post('webhook')
  @HttpCode(200)
  @ApiOperation({ summary: 'Handle Trello webhook events' })
  async handleWebhook(@Body() payload: any) {
    if (payload && payload.action) {
      this.trelloService.handleWebhookEvent(payload.action).catch((err) => {
        this.logger.error(`Ошибка обработки вебхука: ${err.message}`);
      });
    }
    return 'OK';
  }
}
