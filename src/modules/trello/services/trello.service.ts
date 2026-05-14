import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import axios from 'axios';
import { RequestStatus } from 'src/common/enums/request-status.enum';
import { TelegramService } from 'src/modules/telegram/telegram.service';
import { Feedback } from 'src/modules/feedbacks/entities/feedback.entity';

@Injectable()
export class TrelloService {
  private readonly logger = new Logger(TrelloService.name);
  private readonly apiKey: string | undefined;
  private readonly apiToken: string | undefined;
  private readonly trelloUrl = 'https://api.trello.com/1';

  private readonly trelloColors = [
    'blue',
    'green',
    'orange',
    'red',
    'yellow',
    'purple',
    'sky',
    'pink',
    'lime',
    'black',
  ];

  constructor(
    private configService: ConfigService,
    private telegramService: TelegramService,
    private dataSource: DataSource,
  ) {
    this.apiKey = this.configService.get<string>('TRELLO_API_KEY');
    this.apiToken = this.configService.get<string>('TRELLO_API_TOKEN');
  }

  // получения метка трелло
  private async getBoardLabels(boardId: string) {
    try {
      const response = await axios.get(
        `${this.trelloUrl}/boards/${boardId}/labels`,
        {
          params: { key: this.apiKey, token: this.apiToken },
        },
      );
      return response.data;
    } catch (error) {
      return [];
    }
  }

  // создания метка трелло
  private async createLabel(boardId: string, name: string, color: string) {
    try {
      const response = await axios.post(
        `${this.trelloUrl}/labels`,
        { name, color, idBoard: boardId },
        { params: { key: this.apiKey, token: this.apiToken } },
      );
      return response.data;
    } catch (error) {
      return null;
    }
  }

  // Получение или создание метки для филиала
  async getOrCreateBranchLabel(
    boardId: string,
    branchName: string,
  ): Promise<string | null> {
    if (!branchName) return null;
    const labels = await this.getBoardLabels(boardId);
    const existingLabel = labels.find(
      (l: any) => l.name.toLowerCase() === branchName.toLowerCase(),
    );
    if (existingLabel) return existingLabel.id;

    const colorIndex = branchName.length % this.trelloColors.length;
    const color = this.trelloColors[colorIndex];
    const newLabel = await this.createLabel(boardId, branchName, color);
    return newLabel ? newLabel.id : null;
  }

  // создания карточка трелло
  async createCard(
    listId: string,
    name: string,
    description: string,
    labelId?: string | null,
  ) {
    try {
      const body: any = {
        idList: listId,
        name: name,
        desc: description,
        pos: 'top',
      };
      if (labelId) body.idLabels = labelId;

      const response = await axios.post(`${this.trelloUrl}/cards`, body, {
        params: { key: this.apiKey, token: this.apiToken },
      });
      return response.data;
    } catch (error) {
      const trelloError = error.response?.data || error.message;
      this.logger.error(
        `Ошибка при создании карточки Trello. Причина: ${JSON.stringify(trelloError)}`,
      );
      throw error;
    }
  }

  // удаления карточки по ID отзыва
  async deleteCardByFeedbackId(feedbackId: string) {
    try {
      const searchRes = await axios.get(`${this.trelloUrl}/search`, {
        params: {
          query: `FeedbackID: ${feedbackId}`,
          key: this.apiKey,
          token: this.apiToken,
          modelTypes: 'cards',
        },
      });
      const cards = searchRes.data.cards;
      if (cards && cards.length > 0) {
        await axios.delete(`${this.trelloUrl}/cards/${cards[0].id}`, {
          params: { key: this.apiKey, token: this.apiToken },
        });
      }
    } catch (error) {
      this.logger.error(`Ошибка при удалении карточки: ${error.message}`);
    }
  }

  private async duplicateCard(sourceCardId: string, targetListId: string) {
    try {
      const response = await axios.post(`${this.trelloUrl}/cards`, null, {
        params: {
          key: this.apiKey,
          token: this.apiToken,
          idCardSource: sourceCardId,
          idList: targetListId,
          pos: 'top',
        },
      });
      return response.data;
    } catch (error) {
      this.logger.error(`Ошибка при дублировании карточки: ${error.message}`);
    }
  }

  private async moveCard(cardId: string, listId: string) {
    await axios.put(
      `${this.trelloUrl}/cards/${cardId}`,
      { idList: listId, pos: 'top' },
      { params: { key: this.apiKey, token: this.apiToken } },
    );
  }

  private async getCardDetails(cardId: string) {
    const res = await axios.get(`${this.trelloUrl}/cards/${cardId}`, {
      params: { key: this.apiKey, token: this.apiToken },
    });
    return res.data;
  }

  private async getCardCommentsCount(cardId: string): Promise<number> {
    try {
      const response = await axios.get(
        `${this.trelloUrl}/cards/${cardId}/actions`,
        {
          params: {
            filter: 'commentCard',
            key: this.apiKey,
            token: this.apiToken,
          },
        },
      );
      return response.data.length;
    } catch (error) {
      this.logger.error(`Ошибка при получении комментариев: ${error.message}`);
      return 0; // В случае ошибки считаем, что комментариев нет, чтобы предотвратить перенос
    }
  }

  private async addCommentToCard(cardId: string, text: string) {
    try {
      await axios.post(
        `${this.trelloUrl}/cards/${cardId}/actions/comments`,
        null,
        {
          params: { text: text, key: this.apiKey, token: this.apiToken },
        },
      );
    } catch (error) {
      this.logger.error(
        `Ошибка при добавлении комментария бота: ${error.message}`,
      );
    }
  }

  async handleWebhookEvent(action: any) {
    if (
      action.type !== 'updateCard' ||
      !action.data.listAfter ||
      !action.data.listBefore
    ) {
      return;
    }

    const cardId = action.data.card.id;
    const cardName = action.data.card.name;
    const listBeforeId = action.data.listBefore.id;
    const listAfterId = action.data.listAfter.id;
    const listAfterName = action.data.listAfter.name;

    const memberUsername = action.memberCreator.username;
    const memberFullName = action.memberCreator.fullName;

    const resolvedListId = this.configService.get('TRELLO_LIST_RESOLVED');
    const unresolvedListId = this.configService.get('TRELLO_LIST_UNRESOLVED');

    const ALLOWED_LISTS = [
      this.configService.get('TRELLO_LIST_NEW_COMPLAINTS'),
      this.configService.get('TRELLO_LIST_ACCEPTED'),
      this.configService.get('TRELLO_LIST_IN_PROGRESS'),
      resolvedListId,
      unresolvedListId,
    ].filter(Boolean);

    const adminsStr = this.configService.get('TRELLO_ADMIN_USERNAMES') || '';
    const admins = adminsStr.split(',').map((u) => u.trim().toLowerCase());
    const isUserAdmin = admins.includes(memberUsername.toLowerCase());

    if (!ALLOWED_LISTS.includes(listAfterId) && !isUserAdmin) {
      this.logger.warn(
        `🚨 Пользователь ${memberUsername} пытался перенести карточку в защищенный список "${listAfterName}". Отказ.`,
      );
      try {
        await this.moveCard(cardId, listBeforeId);
        await this.telegramService.sendSecurityAlert(
          memberFullName,
          cardName,
          listAfterName,
        );
      } catch (error) {
        this.logger.error(
          `Ошибка при возврате карточки обратно: ${error.message}`,
        );
      }
      return;
    }

    if (listAfterId === resolvedListId || listAfterId === unresolvedListId) {
      const commentsCount = await this.getCardCommentsCount(cardId);

      if (commentsCount === 0) {
        this.logger.warn(
          `⚠️ Попытка закрыть карточку "${cardName}" без комментария. Отказ.`,
        );

        try {
          // Возвращаем карточку обратно в предыдущую колонку
          await this.moveCard(cardId, listBeforeId);

          // Оставляем комментарий в карточке с пояснением
          const botMessage = `⚠️ @${memberUsername}, перенос отменен! Чтобы перевести карточку в статус "${listAfterName}", необходимо добавить хотя бы один комментарий с пояснением или итогом работы.`;
          await this.addCommentToCard(cardId, botMessage);
        } catch (error) {
          this.logger.error(
            `Ошибка при обработке отсутствия комментария: ${error.message}`,
          );
        }
        return; 
      }
    }

    const suggestionsListId = this.configService.get('TRELLO_LIST_SUGGESTIONS');
    const notRelatedListId = this.configService.get('TRELLO_LIST_NOT_RELATED'); 

    if (listAfterId === suggestionsListId) {
      await this.handleMovedToSuggestions(cardId);
    }
    else if (listAfterId === notRelatedListId) {
      await this.handleMovedToNotRelated(cardId);
    }
  }

  private async handleMovedToNotRelated(cardId: string) {
    try {
      const card = await this.getCardDetails(cardId);
      const desc = card.desc || '';
      
      const match = desc.match(/FeedbackID:\s*([a-zA-Z0-9-]+)/);
      if (!match || !match[1]) return; 

      const feedbackId = match[1];

      const queryRunner = this.dataSource.createQueryRunner();
      await queryRunner.connect();
      await queryRunner.startTransaction();

      try {
        const feedback = await queryRunner.manager.findOne(Feedback, { 
          where: { id: feedbackId }, 
          relations: ['request'] 
        });

        if (feedback && feedback.request) {
          // Обновляем статус заявки на новый
          feedback.request.status = RequestStatus.FEEDBACK_NOT_RELATED;
          await queryRunner.manager.save(feedback.request);
          
          this.logger.log(`Статус заявки для Feedback ${feedbackId} успешно изменен на "Не относится к клинике"`);
        }
        
        await queryRunner.commitTransaction();
      } catch (err) {
        await queryRunner.rollbackTransaction();
        this.logger.error(`Ошибка БД при обновлении статуса "Не относится к клинике": ${err.message}`);
      } finally {
        await queryRunner.release();
      }

    } catch (error) {
      this.logger.error(`Ошибка при обработке переноса в "Не относится к клинике": ${error.message}`);
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
        const feedback = await queryRunner.manager.findOne(Feedback, {
          where: { id: feedbackId },
          relations: ['request'],
        });
        if (feedback) {
          const newRatings = { ...feedback.ratings };
          for (const key in newRatings) {
            newRatings[key] = 5;
          }
          feedback.ratings = newRatings;
          await queryRunner.manager.save(feedback);

          if (feedback.request) {
            feedback.request.status = RequestStatus.FEEDBACK_POSITIVE;
            await queryRunner.manager.save(feedback.request);
          }
          this.logger.log(
            `Feedback ${feedbackId} успешно изменен на "Предложение" (все оценки = 5)`,
          );
        }
        await queryRunner.commitTransaction();
      } catch (err) {
        await queryRunner.rollbackTransaction();
        this.logger.error(
          `Ошибка БД при обновлении предложения: ${err.message}`,
        );
      } finally {
        await queryRunner.release();
      }

      // 2. Дублирование на другую доску
      const targetListId = this.configService.get<string>(
        'TRELLO_LIST_SUGGESTIONS_COPY',
      );
      if (targetListId) {
        await this.duplicateCard(cardId, targetListId);
        this.logger.log(
          `Карточка ${cardId} успешно продублирована в список ${targetListId}`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Ошибка при конвертации в Предложение: ${error.message}`,
      );
    }
  }

  // --- МЕТОДЫ ДЛЯ SLA (CRON) ---
  async getCardsInList(listId: string) {
    try {
      const response = await axios.get(
        `${this.trelloUrl}/lists/${listId}/cards`,
        {
          params: { key: this.apiKey, token: this.apiToken },
        },
      );
      return response.data;
    } catch (error) {
      this.logger.error(
        `Ошибка при получении карточек списка: ${error.message}`,
      );
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
      await axios.post(`${this.trelloUrl}/cards/${cardId}/idLabels`, null, {
        params: { value: labelId, key: this.apiKey, token: this.apiToken },
      });
    } catch (error) {
      this.logger.error(
        `Ошибка при добавлении метки к карточке: ${error.message}`,
      );
    }
  }
}
