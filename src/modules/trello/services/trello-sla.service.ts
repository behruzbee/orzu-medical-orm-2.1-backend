import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { TrelloService } from './trello.service';
import { TelegramService } from 'src/modules/telegram/telegram.service';

@Injectable()
export class TrelloSlaService {
  private readonly logger = new Logger(TrelloSlaService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly trelloService: TrelloService,
    private readonly telegramService: TelegramService,
  ) {}

  // Запускаем каждый час в 00 минут
  @Cron(CronExpression.EVERY_MINUTE)
  async checkSLA() {
    this.logger.log('⏳ Запуск проверки муддат (SLA) в Trello...');

    const boardId = this.configService.get<string>('TRELLO_BOARD_ID');
    if (!boardId) return;

    // ВАШИ ПРАВИЛА (тайминги указаны в часах)
    const slaConfig = [
      { listId: this.configService.get('TRELLO_LIST_NEW_COMPLAINTS'), name: 'Поступившие жалобы', limitHours: 12 },
      { listId: this.configService.get('TRELLO_LIST_ACCEPTED'), name: 'Принято', limitHours: 24 },
      { listId: this.configService.get('TRELLO_LIST_IN_PROGRESS'), name: 'В процессе', limitHours: 72 },
      { listId: this.configService.get('TRELLO_LIST_UNRESOLVED'), name: 'Не решено', limitHours: 168 }, // 1 неделя
      { listId: this.configService.get('TRELLO_LIST_RESOLVED'), name: 'Решено', limitHours: 168 }, // 1 неделя
    ];

    // Получаем ID красной метки "Муддат ўтди 🚨", чтобы вешать ее на просроченные карточки
    const overdueLabelId = await this.trelloService.getOrCreateOverdueLabel(boardId);
    const now = Date.now();

    for (const config of slaConfig) {
      if (!config.listId) continue;

      // Получаем все карточки из колонки
      const cards = await this.trelloService.getCardsInList(config.listId);
      
      for (const card of cards) {
        // Если на карточке уже висит метка "Просрочено", значит мы уже отправляли алерт - пропускаем
        if (overdueLabelId && card.idLabels.includes(overdueLabelId)) {
          continue;
        }

        // Вычисляем, сколько часов карточка находится без движения
        const lastActivity = new Date(card.dateLastActivity).getTime();
        const diffHours = (now - lastActivity) / (1000 * 60 * 60);

        // Если прошло больше времени, чем разрешено
        if (diffHours > config.limitHours) {
          this.logger.warn(`🚨 Карточка "${card.name}" просрочена в списке "${config.name}"!`);
          
          // 1. Вешаем красную метку в самом Trello
          if (overdueLabelId) {
            await this.trelloService.addLabelToCard(card.id, overdueLabelId);
          }

          // 2. Отправляем уведомление в Telegram бот
          const overtimeText = `${Math.floor(diffHours)} соат (лимит: ${config.limitHours} соат)`;
          await this.telegramService.sendDeadlineAlert(card.name, card.shortUrl, config.name, overtimeText);
        }
      }
    }
    
    this.logger.log('✅ Проверка SLA завершена.');
  }
}