import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import axios from 'axios';
import { PatientStatus } from 'src/common/enums/patient-status.enum';
import { TelegramService } from 'src/modules/telegram/telegram.service';
import { Feedback } from 'src/modules/feedbacks/entities/feedback.entity';

@Injectable()
export class TrelloService {
  private readonly logger = new Logger(TrelloService.name);
  private readonly apiKey: string | undefined;
  private readonly apiToken: string | undefined;
  private readonly baseUrl = 'https://api.trello.com/1';

  private readonly trelloColors = [
    'blue', 'green', 'orange', 'red', 'yellow', 'purple', 'sky', 'pink', 'lime', 'black'
  ];

  constructor(
    private configService: ConfigService,
    private telegramService: TelegramService,
    private dataSource: DataSource,
  ) {
    this.apiKey = this.configService.get<string>('TRELLO_API_KEY');
    this.apiToken = this.configService.get<string>('TRELLO_API_TOKEN');
  }

  // --- МЕТОДЫ УПРАВЛЕНИЯ МЕТКАМИ ---
  private async getBoardLabels(boardId: string) {
    try {
      const response = await axios.get(`${this.baseUrl}/boards/${boardId}/labels`, {
        params: { key: this.apiKey, token: this.apiToken },
      });
      return response.data;
    } catch (error) {
      return [];
    }
  }

  private async createLabel(boardId: string, name: string, color: string) {
    try {
      const response = await axios.post(
        `${this.baseUrl}/labels`,
        { name, color, idBoard: boardId },
        { params: { key: this.apiKey, token: this.apiToken } }
      );
      return response.data;
    } catch (error) {
      return null;
    }
  }

  async getOrCreateBranchLabel(boardId: string, branchName: string): Promise<string | null> {
    if (!branchName) return null;
    const labels = await this.getBoardLabels(boardId);
    const existingLabel = labels.find((l: any) => l.name.toLowerCase() === branchName.toLowerCase());
    if (existingLabel) return existingLabel.id;

    const colorIndex = branchName.length % this.trelloColors.length;
    const color = this.trelloColors[colorIndex];
    const newLabel = await this.createLabel(boardId, branchName, color);
    return newLabel ? newLabel.id : null;
  }

  // --- МЕТОДЫ УПРАВЛЕНИЯ КАРТОЧКАМИ И КОММЕНТАРИЯМИ ---
  async createCard(listId: string, name: string, description: string, labelId?: string | null) {
    try {
      const body: any = { idList: listId, name: name, desc: description, pos: 'top' };
      if (labelId) body.idLabels = labelId;

      const response = await axios.post(`${this.baseUrl}/cards`, body, {
        params: { key: this.apiKey, token: this.apiToken },
      });
      return response.data;
    } catch (error) {
      const trelloError = error.response?.data || error.message;
      this.logger.error(`Ошибка при создании карточки Trello. Причина: ${JSON.stringify(trelloError)}`);
      throw error;
    }
  }

  async deleteCardByFeedbackId(feedbackId: string) {
    try {
      const searchRes = await axios.get(`${this.baseUrl}/search`, {
        params: { query: `FeedbackID: ${feedbackId}`, key: this.apiKey, token: this.apiToken, modelTypes: 'cards' }
      });
      const cards = searchRes.data.cards;
      if (cards && cards.length > 0) {
        await axios.delete(`${this.baseUrl}/cards/${cards[0].id}`, {
          params: { key: this.apiKey, token: this.apiToken }
        });
      }
    } catch (error) {
      this.logger.error(`Ошибка при удалении карточки: ${error.message}`);
    }
  }

  private async duplicateCard(sourceCardId: string, targetListId: string) {
    try {
      const response = await axios.post(`${this.baseUrl}/cards`, null, {
        params: {
          key: this.apiKey,
          token: this.apiToken,
          idCardSource: sourceCardId,
          idList: targetListId,
          pos: 'top'
        }
      });
      return response.data;
    } catch (error) {
      this.logger.error(`Ошибка при дублировании карточки: ${error.message}`);
    }
  }

  private async moveCard(cardId: string, listId: string) {
    await axios.put(`${this.baseUrl}/cards/${cardId}`, 
      { idList: listId, pos: 'top' }, 
      { params: { key: this.apiKey, token: this.apiToken } }
    );
  }

  private async getCardDetails(cardId: string) {
    const res = await axios.get(`${this.baseUrl}/cards/${cardId}`, {
      params: { key: this.apiKey, token: this.apiToken }
    });
    return res.data;
  }

  // НОВЫЙ МЕТОД: Получение количества комментариев
  private async getCardCommentsCount(cardId: string): Promise<number> {
    try {
      const response = await axios.get(`${this.baseUrl}/cards/${cardId}/actions`, {
        params: { filter: 'commentCard', key: this.apiKey, token: this.apiToken },
      });
      return response.data.length;
    } catch (error) {
      this.logger.error(`Ошибка при получении комментариев: ${error.message}`);
      return 0; // В случае ошибки считаем, что комментариев нет, чтобы предотвратить перенос
    }
  }

  // НОВЫЙ МЕТОД: Добавление комментария от лица системы (бота)
  private async addCommentToCard(cardId: string, text: string) {
    try {
      await axios.post(`${this.baseUrl}/cards/${cardId}/actions/comments`, null, {
        params: { text: text, key: this.apiKey, token: this.apiToken },
      });
    } catch (error) {
      this.logger.error(`Ошибка при добавлении комментария бота: ${error.message}`);
    }
  }

  // --- ОБРАБОТЧИК WEBHOOK-СОБЫТИЙ ---
  async handleWebhookEvent(action: any) {
    if (action.type !== 'updateCard' || !action.data.listAfter || !action.data.listBefore) {
      return;
    }

    const cardId = action.data.card.id;
    const cardName = action.data.card.name;
    const listBeforeId = action.data.listBefore.id;
    const listAfterId = action.data.listAfter.id;
    const listAfterName = action.data.listAfter.name;
    
    const memberUsername = action.memberCreator.username;
    const memberFullName = action.memberCreator.fullName;

    // ID колонок, для которых требуются комментарии
    const resolvedListId = this.configService.get('TRELLO_LIST_RESOLVED');
    const unresolvedListId = this.configService.get('TRELLO_LIST_UNRESOLVED');

    // 1. Формируем "Белый список" колонок, доступных ВСЕМ пользователям
    const ALLOWED_LISTS = [
      this.configService.get('TRELLO_LIST_NEW_COMPLAINTS'),
      this.configService.get('TRELLO_LIST_ACCEPTED'),
      this.configService.get('TRELLO_LIST_IN_PROGRESS'),
      resolvedListId,
      unresolvedListId,
    ].filter(Boolean);

    const adminsStr = this.configService.get('TRELLO_ADMIN_USERNAMES') || '';
    const admins = adminsStr.split(',').map(u => u.trim().toLowerCase());
    const isUserAdmin = admins.includes(memberUsername.toLowerCase());

    // 2. ПРОВЕРКА ПРАВ ДОСТУПА К КОЛОНКАМ (SECURITY)
    if (!ALLOWED_LISTS.includes(listAfterId) && !isUserAdmin) {
      this.logger.warn(`🚨 Пользователь ${memberUsername} пытался перенести карточку в защищенный список "${listAfterName}". Отказ.`);
      try {
        await this.moveCard(cardId, listBeforeId);
        await this.telegramService.sendSecurityAlert(memberFullName, cardName, listAfterName);
      } catch (error) {
        this.logger.error(`Ошибка при возврате карточки обратно: ${error.message}`);
      }
      return; 
    }

    // 3. ПРОВЕРКА НАЛИЧИЯ КОММЕНТАРИЕВ ДЛЯ "РЕШЕНО" И "НЕ РЕШЕНО"
    if (listAfterId === resolvedListId || listAfterId === unresolvedListId) {
      const commentsCount = await this.getCardCommentsCount(cardId);
      
      if (commentsCount === 0) {
        this.logger.warn(`⚠️ Попытка закрыть карточку "${cardName}" без комментария. Отказ.`);
        
        try {
          // Возвращаем карточку обратно в предыдущую колонку
          await this.moveCard(cardId, listBeforeId);
          
          // Оставляем комментарий в карточке с пояснением
          const botMessage = `⚠️ @${memberUsername}, перенос отменен! Чтобы перевести карточку в статус "${listAfterName}", необходимо добавить хотя бы один комментарий с пояснением или итогом работы.`;
          await this.addCommentToCard(cardId, botMessage);
        } catch (error) {
          this.logger.error(`Ошибка при обработке отсутствия комментария: ${error.message}`);
        }
        return; // Обязательно прерываем выполнение, чтобы не сработала логика ниже
      }
    }

    // 4. ЛОГИКА "ПРЕДЛОЖЕНИЯ" 
    const suggestionsListId = this.configService.get('TRELLO_LIST_SUGGESTIONS');
    if (listAfterId === suggestionsListId) {
      await this.handleMovedToSuggestions(cardId);
    }
  }

  private async handleMovedToSuggestions(cardId: string) {
    try {
      const card = await this.getCardDetails(cardId);
      const desc = card.desc || '';
      
      const match = desc.match(/FeedbackID:\s*([a-zA-Z0-9-]+)/);
      if (!match || !match[1]) return; 

      const feedbackId = match[1];

      // 1. Обновляем БД (Транзакция)
      const queryRunner = this.dataSource.createQueryRunner();
      await queryRunner.connect();
      await queryRunner.startTransaction();

      try {
        const feedback = await queryRunner.manager.findOne(Feedback, { where: { id: feedbackId }, relations: ['patient'] });
        if (feedback) {
          const newRatings = { ...feedback.ratings };
          for (const key in newRatings) {
            newRatings[key] = 5;
          }
          feedback.ratings = newRatings;
          await queryRunner.manager.save(feedback);

          if (feedback.patient) {
            feedback.patient.status = PatientStatus.FEEDBACK_POSITIVE;
            await queryRunner.manager.save(feedback.patient);
          }
          this.logger.log(`Feedback ${feedbackId} успешно изменен на "Предложение" (все оценки = 5)`);
        }
        await queryRunner.commitTransaction();
      } catch (err) {
        await queryRunner.rollbackTransaction();
        this.logger.error(`Ошибка БД при обновлении предложения: ${err.message}`);
      } finally {
        await queryRunner.release();
      }

      // 2. Дублирование на другую доску
      const targetListId = this.configService.get<string>('TRELLO_LIST_SUGGESTIONS_COPY');
      if (targetListId) {
        await this.duplicateCard(cardId, targetListId);
        this.logger.log(`Карточка ${cardId} успешно продублирована в список ${targetListId}`);
      }

    } catch (error) {
      this.logger.error(`Ошибка при конвертации в Предложение: ${error.message}`);
    }
  }

  // --- МЕТОДЫ ДЛЯ SLA (CRON) ---
  async getCardsInList(listId: string) {
    try {
      const response = await axios.get(`${this.baseUrl}/lists/${listId}/cards`, {
        params: { key: this.apiKey, token: this.apiToken },
      });
      return response.data;
    } catch (error) {
      this.logger.error(`Ошибка при получении карточек списка: ${error.message}`);
      return [];
    }
  }

  async getOrCreateOverdueLabel(boardId: string): Promise<string | null> {
    const labelName = 'Муддат ўтди 🚨';
    const labels = await this.getBoardLabels(boardId);
    const existing = labels.find((l: any) => l.name === labelName);
    if (existing) return existing.id;

    const newLabel = await this.createLabel(boardId, labelName, 'red');
    return newLabel ? newLabel.id : null;
  }

  async addLabelToCard(cardId: string, labelId: string) {
    try {
      await axios.post(`${this.baseUrl}/cards/${cardId}/idLabels`, null, {
        params: { value: labelId, key: this.apiKey, token: this.apiToken },
      });
    } catch (error) {
      this.logger.error(`Ошибка при добавлении метки к карточке: ${error.message}`);
    }
  }
}