import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import TelegramBot from 'node-telegram-bot-api';

@Injectable()
export class TelegramService {
  private readonly logger = new Logger(TelegramService.name);
  private bot: TelegramBot;
  private readonly chatId: string;

  constructor(private configService: ConfigService) {
    const token = this.configService.get<string>('TELEGRAM_BOT_TOKEN');
    this.chatId = this.configService.get<string>('TELEGRAM_CHAT_ID')!;

    if (token) {
      this.bot = new TelegramBot(token, { polling: false });
      this.logger.log('🤖 Telegram bot успешно инициализирован');
    }
  }

  // Алерт о просрочке (SLA)
  async sendDeadlineAlert(cardName: string, cardUrl: string, listName: string, overtime: string) {
    const message = `🚨 <b>ДИҚҚАТ! Муддат ўтди (Просрочка)!</b> 🚨\n\n🗂 <b>Босқич:</b> ${listName}\n⏳ <b>Кечикиш:</b> ${overtime}\n📋 <b>Карточка:</b> ${cardName}\n\n🔗 <a href="${cardUrl}">Карточкани очиш</a>\n\n<i>Илтимос, тезкор чора кўринг!</i>`;
    await this.sendMessage(message);
  }

  // Алерт о нарушении прав
  async sendSecurityAlert(userName: string, cardName: string, listName: string) {
    const message = `⚠️ <b>РУХСАТСИЗ ҲАРАКАТ</b> ⚠️\n\n👤 <b>Фойдаланувчи:</b> ${userName}\n🚫 <b>Ҳаракат:</b> Карточкани «${listName}» га ўтказишга уринди.\n📋 <b>Карточка:</b> ${cardName}\n\n<i>Тизим бу ҳаракатни бекор қилди.</i>`;
    await this.sendMessage(message);
  }

  private async sendMessage(text: string) {
    if (!this.bot || !this.chatId) return;
    try {
      await this.bot.sendMessage(this.chatId, text, { parse_mode: 'HTML', disable_web_page_preview: true });
    } catch (error) {
      this.logger.error(`❌ Ошибка отправки в Telegram: ${error.message}`);
    }
  }
}