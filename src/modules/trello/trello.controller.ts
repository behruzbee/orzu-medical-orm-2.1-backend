import { Controller, Post, Get, Body, HttpCode, Logger } from '@nestjs/common';
import { TrelloService } from './services/trello.service';

@Controller('trello')
export class TrelloController {
  private readonly logger = new Logger(TrelloController.name);

  constructor(private readonly trelloService: TrelloService) {}

  @Get('webhook')
  verifyWebhook() {
    this.logger.log('Trello проверил Webhook URL');
    return 'OK';
  }

  @Post('webhook')
  @HttpCode(200) 
  async handleWebhook(@Body() payload: any) {
    if (payload && payload.action) {
      this.trelloService.handleWebhookEvent(payload.action).catch(err => {
        this.logger.error(`Ошибка обработки вебхука: ${err.message}`);
      });
    }
    return 'OK';
  }
}