import {
  BadRequestException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { v4 as uuidv4 } from 'uuid';

import { Feedback } from './entities/feedback.entity';
import { PatientRequest } from '../patients/entities/patient_requests.entity';
import { RequestStatus } from 'src/common/enums/request-status.enum';
import {
  EvidenceMessage,
  EvidenceSource,
  EvidenceType,
} from './entities/evidence-message.entity';
import { CreateFeedbackDto } from './dto/create-feedback.dto';
import { TrelloService } from '../trello/services/trello.service';
import { patientRequestUrl, trelloEvidenceLines } from './trello-links';
import { AudioPlaybackService } from '../archive/audio-playback.service';
import { FeedbackSubcategory } from './entities/feedback-subcategory.entity';
import { CreateSubcategoryDto } from './dto/create-subcategory.dto';
import { formatBranchName } from 'src/common/utils/branch.util';

const DEFAULT_SUBCATEGORIES: Record<string, string[]> = {
  doctors: ['Муомала', 'Ташхис', 'Даволаш сифати', 'Кутиш вақти'],
  nurses: ['Муомала', 'Чақирувга кеч келиш', 'Муолажа сифати'],
  cleanliness: ['Хона тозалиги', 'Санузел тозалиги', 'Чиқинди'],
  food: ['Таом сифати', 'Меню', 'Етказиш вақти'],
  reception: ['Муомала', 'Кутиш вақти', 'Маълумот нотўғри берилди'],
  clinic: ['Смеситель ишламайди', 'Жиҳоз носоз', 'Шовқин', 'Ҳарорат'],
};

@Injectable()
export class FeedbacksService implements OnModuleInit {
  constructor(
    @InjectRepository(Feedback)
    private feedbackRepo: Repository<Feedback>,
    @InjectRepository(EvidenceMessage)
    private evidenceRepo: Repository<EvidenceMessage>,
    @InjectRepository(FeedbackSubcategory)
    private subcategoryRepo: Repository<FeedbackSubcategory>,
    @InjectRepository(PatientRequest)
    private requestRepo: Repository<PatientRequest>,
    private readonly trelloService: TrelloService,
    private readonly configService: ConfigService,
    private readonly audioPlayback: AudioPlaybackService,
  ) {}

  async onModuleInit() {
    const rows = (['complaint', 'suggestion'] as const).flatMap((type) =>
      Object.entries(DEFAULT_SUBCATEGORIES).flatMap(([category, names]) =>
        names.map((name) => ({
          type,
          category,
          name,
          normalizedName: this.normalizeSubcategory(name),
          isCustom: false,
        })),
      ),
    );

    await this.subcategoryRepo.upsert(rows, {
      conflictPaths: ['type', 'category', 'normalizedName'],
      skipUpdateIfNoValuesChanged: true,
    });

    // The new column defaults to complaint for a safe schema update. Restore
    // the real type of historical suggestions from their request status.
    await this.feedbackRepo.query(`
      UPDATE feedbacks AS feedback
      SET type = 'suggestion'
      FROM patient_requests AS request
      WHERE feedback."requestId" = request.id
        AND request.status = 'feedback_pos'
        AND feedback.type <> 'suggestion'
    `);
  }

  private normalizeSubcategory(value: string) {
    return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('ru-RU');
  }

  async createSubcategory(dto: CreateSubcategoryDto, isCustom = true) {
    const name = dto.name.trim().replace(/\s+/g, ' ');
    const category = dto.category.trim().toLowerCase();
    const normalizedName = this.normalizeSubcategory(name);

    const existing = await this.subcategoryRepo.findOne({
      where: { type: dto.type, category, normalizedName },
    });
    if (existing) return existing;

    try {
      return await this.subcategoryRepo.save(
        this.subcategoryRepo.create({
          type: dto.type,
          category,
          name,
          normalizedName,
          isCustom,
        }),
      );
    } catch {
      return this.subcategoryRepo.findOneOrFail({
        where: { type: dto.type, category, normalizedName },
      });
    }
  }

  async findSubcategories(type?: string, category?: string) {
    const qb = this.subcategoryRepo
      .createQueryBuilder('subcategory')
      .orderBy('subcategory.isCustom', 'ASC')
      .addOrderBy('subcategory.name', 'ASC');

    if (type) qb.andWhere('subcategory.type = :type', { type });
    if (category) {
      qb.andWhere('subcategory.category = :category', {
        category: category.trim().toLowerCase(),
      });
    }

    return qb.getMany();
  }

  async createComplaint(
    requestId: string,
    dto: CreateFeedbackDto,
    operatorId: string,
  ) {
    return this.processAndCreateFeedback(
      requestId,
      dto,
      operatorId,
      'complaint',
    );
  }

  async createSuggestion(
    requestId: string,
    dto: CreateFeedbackDto,
    operatorId: string,
  ) {
    return this.processAndCreateFeedback(
      requestId,
      dto,
      operatorId,
      'suggestion',
    );
  }

  private async processAndCreateFeedback(
    requestId: string,
    dto: CreateFeedbackDto,
    operatorId: string,
    type: 'complaint' | 'suggestion',
  ) {
    const request = await this.requestRepo.findOne({
      where: { id: requestId },
      relations: ['patient', 'feedback', 'feedback.evidenceMessages'],
    });

    if (!request) {
      throw new NotFoundException(`Заявка с ID ${requestId} не найдена`);
    }

    const category = dto.category.trim().toLowerCase();
    const subcategoryRecord = await this.createSubcategory(
      { type, category, name: dto.subcategory },
      true,
    );
    const occurrenceNumber =
      (await this.feedbackRepo.count({
        where: {
          ...(request.feedback ? { id: Not(request.feedback.id) } : {}),
          type,
          category,
          subcategory: subcategoryRecord.name,
        },
      })) + 1;

    const backendUrl = process.env.UPLOAD_URL || 'http://localhost:3000';

    const processedEvidence = await Promise.all(
      dto.evidence.map(async (item) => {
        let buffer: Buffer | null = null;
        let mimeType: string | null = null;
        let finalUrl = item.mediaUrl;

        const evidenceId = uuidv4();

        if (item.mediaUrl && item.mediaUrl.startsWith('data:')) {
          const matches = item.mediaUrl.match(/^data:(.+);base64,(.+)$/);

          if (matches && matches.length === 3) {
            mimeType = matches[1];
            buffer = Buffer.from(matches[2], 'base64');
            finalUrl = `${backendUrl}/api/feedbacks/evidence/${evidenceId}/file`;
          }
        }

        const newEvidence = new EvidenceMessage();
        newEvidence.id = evidenceId;
        newEvidence.type = item.type as EvidenceType;
        newEvidence.text = item.text || '';
        newEvidence.mediaUrl = finalUrl || '';
        newEvidence.mediaData = buffer || Buffer.from('');
        newEvidence.mimeType = mimeType || '';
        newEvidence.duration = item.duration || '';
        newEvidence.source =
          (item.source as EvidenceSource) || EvidenceSource.MANUAL;
        newEvidence.sender = item.sender || 'patient';
        newEvidence.originalTimestamp =
          item.originalTimestamp || new Date().toISOString();

        return newEvidence;
      }),
    );

    const feedbackData = {
      requestId,
      operatorId,
      ratings: dto.ratings,
      comment: dto.comment,
      type,
      category,
      subcategory: subcategoryRecord.name,
      occurrenceNumber,
      evidenceMessages: [
        ...(request.feedback?.evidenceMessages || []),
        ...processedEvidence,
      ],
    };

    // A reverted request keeps its original feedback for audit/history.
    // Reuse that row when the operator submits a corrected result instead of
    // inserting a second row that violates the one-feedback-per-request rule.
    const feedbackToSave = request.feedback
      ? this.feedbackRepo.merge(request.feedback, feedbackData)
      : this.feedbackRepo.create(feedbackData);

    const savedFeedback = await this.feedbackRepo.save(feedbackToSave);

    request.status =
      type === 'complaint'
        ? RequestStatus.FEEDBACK_NEGATIVE
        : RequestStatus.FEEDBACK_POSITIVE;
    await this.requestRepo.save(request);

    const listId =
      type === 'complaint'
        ? this.configService.get<string>('TRELLO_LIST_NEW_COMPLAINTS')
        : this.configService.get<string>('TRELLO_LIST_SUGGESTIONS');

    if (listId) {
      try {
        const patientName = request.patient?.name || 'Неизвестно';
        const patientPhone = request.patient?.phone || 'Неизвестно';
        const branchName = request.branch || 'Неизвестно';

        const arrivalDateStr = request.arrivalDate
          ? new Date(request.arrivalDate).toLocaleDateString('ru-RU', {
              timeZone: 'Asia/Tashkent',
              day: '2-digit',
              month: '2-digit',
              year: 'numeric',
            })
          : 'Не указана';

        const translationMap: Record<string, string> = {
          doctors: 'Шифокорлар (Врачи)',
          nurses: 'Ҳамширалар (Медсестры)',
          cleanliness: 'Тозалик (Чистота)',
          food: 'Овқатланиш (Питание)',
          reception: 'Қабулхона (Ресепшн)',
          clinic: 'Клиника (Клиника)',
          overall: 'Умумий хулоса (Общее впечатление)',
        };

        let ratingsText = '';
        if (dto.ratings && Object.keys(dto.ratings).length > 0) {
          ratingsText =
            '\n\n📊 Баллар:\n' +
            Object.entries(dto.ratings)
              .map(([key, value]) => {
                const translatedName = translationMap[key] || key;
                return `🔹 ${translatedName}: ${value}/5`;
              })
              .join('\n');
        }

        let evidenceText = '';
        if (processedEvidence.length > 0) {
          evidenceText =
            '\n\n📎 Вложения:\n' +
            (await trelloEvidenceLines(processedEvidence, async (id) => {
              const link = await this.audioPlayback.share(
                operatorId,
                'v21',
                savedFeedback.id,
                id,
              );
              return link.url;
            }));
        }

        const requestUrl = patientRequestUrl(
          this.configService.get<string>('FRONTEND_URL') ||
            'https://orzu-medical-orm-2-1-frontend.vercel.app',
          request.id,
        );

        const dateStr = new Date().toLocaleString('ru-RU', {
          timeZone: 'Asia/Tashkent',
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        });

        let categoryText =
          type === 'complaint' ? 'Умумий (Общее)' : 'Таклиф (Предложение)';

        if (dto.category && translationMap[dto.category]) {
          categoryText = translationMap[dto.category];
        }

        const cardName = `${branchName.toUpperCase()} — ${categoryText} — ${subcategoryRecord.name}`;

        const titleType = type === 'complaint' ? 'Жалоба' : 'Предложение';
        const icon = type === 'complaint' ? '📋' : '💡';

        // Добавлено поле "Дата заезда"
        const cardDesc = `${icon} ${titleType} по заявке
👤 ФИО: ${patientName}
📞 Телефон: ${patientPhone}
🏥 Филиал: ${branchName}
🗓 Дата заезда: ${arrivalDateStr}
📂 Категория: ${categoryText}
📌 Подкатегория: ${subcategoryRecord.name}
🔁 Повторность: ${occurrenceNumber > 1 ? `ПОВТОРНАЯ, обращение №${occurrenceNumber}` : 'первичная'}
📝 Текст ва Далиллар:
${dto.comment || 'К заявке не оставлен комментарий.'}${evidenceText}${ratingsText}

📅 Дата отправки: ${dateStr}
🔗 Карточка пациента (вход в аккаунт): ${requestUrl}
🆔 FeedbackID: ${savedFeedback.id}`;

        const boardId = this.configService.get<string>('TRELLO_BOARD_ID');
        const branchLabelId = boardId
          ? await this.trelloService.getOrCreateBranchLabel(boardId, branchName)
          : null;

        const existingCardId = savedFeedback.trelloUrl
          ? new URL(savedFeedback.trelloUrl).pathname
              .split('/')
              .filter(Boolean)[1]
          : null;

        const card = existingCardId
          ? await this.trelloService.updateCard(
              existingCardId,
              listId,
              cardName,
              cardDesc,
            )
          : await this.trelloService.createCard(
              listId,
              cardName,
              cardDesc,
              branchLabelId,
            );

        if (card && card.shortUrl) {
          savedFeedback.trelloUrl = card.shortUrl;
          await this.feedbackRepo.save(savedFeedback);
        }
      } catch (error) {
        console.error(`Ошибка при отправке ${type} в Trello:`, error.message);
      }
    }

    return savedFeedback;
  }

  async findAll() {
    return this.feedbackRepo.find({
      relations: ['request', 'evidenceMessages'],
      order: { createdAt: 'DESC' },
    });
  }

  private resolveAnalyticsPeriod(dateFrom?: string, dateTo?: string) {
    const today = new Date();
    const defaultStart = new Date(today);
    defaultStart.setDate(defaultStart.getDate() - 13);

    const from = dateFrom || defaultStart.toISOString().slice(0, 10);
    const to = dateTo || today.toISOString().slice(0, 10);

    if (from > to) {
      throw new BadRequestException('dateFrom must be before dateTo');
    }

    const days =
      Math.floor(
        (new Date(`${to}T00:00:00Z`).getTime() -
          new Date(`${from}T00:00:00Z`).getTime()) /
          86_400_000,
      ) + 1;

    return { dateFrom: from, dateTo: to, days };
  }

  async getAnalytics(dateFrom?: string, dateTo?: string, branch?: string) {
    const period = this.resolveAnalyticsPeriod(dateFrom, dateTo);
    const periodParams = {
      dateFrom: period.dateFrom,
      dateTo: period.dateTo,
    };

    const branchRows = await this.requestRepo
      .createQueryBuilder('request')
      .select('DISTINCT request.branch', 'branch')
      .orderBy('request.branch', 'ASC')
      .getRawMany<{ branch: string }>();
    const branches = [
      ...new Set(
        branchRows.map((row) => formatBranchName(row.branch)).filter(Boolean),
      ),
    ] as string[];
    const branchValues = branch
      ? branchRows
          .filter((row) => formatBranchName(row.branch) === branch)
          .map((row) => row.branch)
      : null;
    if (branch && !branchValues?.length) {
      throw new BadRequestException('Unknown branch');
    }

    const feedbackQuery = () => {
      const query = this.feedbackRepo
        .createQueryBuilder('feedback')
        .where('feedback.createdAt >= CAST(:dateFrom AS date)', periodParams)
        .andWhere(
          "feedback.createdAt < CAST(:dateTo AS date) + INTERVAL '1 day'",
          periodParams,
        );
      if (branchValues) {
        query
          .innerJoin('feedback.request', 'request')
          .andWhere('request.branch IN (:...branchValues)', { branchValues });
      }
      return query;
    };
    const requestQuery = () => {
      const query = this.requestRepo
        .createQueryBuilder('request')
        .where('request.createdAt >= CAST(:dateFrom AS date)', periodParams)
        .andWhere(
          "request.createdAt < CAST(:dateTo AS date) + INTERVAL '1 day'",
          periodParams,
        );
      if (branchValues) {
        query.andWhere('request.branch IN (:...branchValues)', {
          branchValues,
        });
      }
      return query;
    };

    const [
      summary,
      dailyRows,
      categories,
      subcategories,
      requestSummary,
      requestDailyRows,
    ] = await Promise.all([
      feedbackQuery()
        .select('COUNT(*)', 'total')
        .addSelect(
          "COUNT(*) FILTER (WHERE feedback.type = 'complaint')",
          'complaints',
        )
        .addSelect(
          "COUNT(*) FILTER (WHERE feedback.type = 'suggestion')",
          'suggestions',
        )
        .addSelect(
          'COUNT(*) FILTER (WHERE feedback.occurrenceNumber > 1)',
          'repeated',
        )
        .addSelect(
          'COUNT(*) FILTER (WHERE feedback.createdAt >= CURRENT_DATE)',
          'today',
        )
        .getRawOne(),
      feedbackQuery()
        .select("TO_CHAR(feedback.createdAt, 'YYYY-MM-DD')", 'date')
        .addSelect(
          "COUNT(*) FILTER (WHERE feedback.type = 'complaint')",
          'complaints',
        )
        .addSelect(
          "COUNT(*) FILTER (WHERE feedback.type = 'suggestion')",
          'suggestions',
        )
        .groupBy("TO_CHAR(feedback.createdAt, 'YYYY-MM-DD')")
        .getRawMany(),
      feedbackQuery()
        .select('feedback.category', 'category')
        .addSelect('COUNT(*)', 'count')
        .addSelect(
          'COUNT(*) FILTER (WHERE feedback.occurrenceNumber > 1)',
          'repeated',
        )
        .groupBy('feedback.category')
        .orderBy('COUNT(*)', 'DESC')
        .getRawMany(),
      feedbackQuery()
        .select('feedback.subcategory', 'name')
        .addSelect('feedback.category', 'category')
        .addSelect('COUNT(*)', 'count')
        .addSelect(
          'COUNT(*) FILTER (WHERE feedback.occurrenceNumber > 1)',
          'repeated',
        )
        .groupBy('feedback.subcategory')
        .addGroupBy('feedback.category')
        .orderBy('COUNT(*)', 'DESC')
        .limit(8)
        .getRawMany(),
      requestQuery()
        .select('COUNT(*)', 'total')
        .addSelect(
          "COUNT(*) FILTER (WHERE request.status <> 'new')",
          'processed',
        )
        .addSelect(
          "COUNT(*) FILTER (WHERE request.status IN ('contacted', 'all_ok', 'feedback_pos', 'feedback_neg', 'feedback_not_related'))",
          'answered',
        )
        .addSelect(
          "COUNT(*) FILTER (WHERE request.status IN ('no_answer', 'unreachable'))",
          'missed',
        )
        .addSelect(
          "COUNT(*) FILTER (WHERE request.status = 'feedback_neg')",
          'complaints',
        )
        .addSelect(
          "COUNT(*) FILTER (WHERE request.status = 'feedback_pos')",
          'suggestions',
        )
        .getRawOne(),
      requestQuery()
        .select("TO_CHAR(request.createdAt, 'YYYY-MM-DD')", 'date')
        .addSelect('COUNT(*)', 'total')
        .addSelect(
          "COUNT(*) FILTER (WHERE request.status IN ('contacted', 'all_ok', 'feedback_pos', 'feedback_neg', 'feedback_not_related'))",
          'answered',
        )
        .addSelect(
          "COUNT(*) FILTER (WHERE request.status IN ('no_answer', 'unreachable'))",
          'missed',
        )
        .groupBy("TO_CHAR(request.createdAt, 'YYYY-MM-DD')")
        .getRawMany(),
    ]);

    const total = Number(summary?.total || 0);
    const repeated = Number(summary?.repeated || 0);
    const feedbackByDate = new Map(dailyRows.map((row) => [row.date, row]));
    const requestsByDate = new Map(
      requestDailyRows.map((row) => [row.date, row]),
    );
    const dates = Array.from({ length: period.days }, (_, index) => {
      const date = new Date(`${period.dateFrom}T00:00:00Z`);
      date.setUTCDate(date.getUTCDate() + index);
      return date.toISOString().slice(0, 10);
    });

    return {
      summary: {
        total,
        complaints: Number(summary?.complaints || 0),
        suggestions: Number(summary?.suggestions || 0),
        repeated,
        today: Number(summary?.today || 0),
        repeatRate: total ? Math.round((repeated / total) * 1000) / 10 : 0,
      },
      daily: dates.map((date) => ({
        date,
        complaints: Number(feedbackByDate.get(date)?.complaints || 0),
        suggestions: Number(feedbackByDate.get(date)?.suggestions || 0),
      })),
      requests: {
        summary: {
          total: Number(requestSummary?.total || 0),
          processed: Number(requestSummary?.processed || 0),
          answered: Number(requestSummary?.answered || 0),
          missed: Number(requestSummary?.missed || 0),
          complaints: Number(requestSummary?.complaints || 0),
          suggestions: Number(requestSummary?.suggestions || 0),
        },
        daily: dates.map((date) => ({
          date,
          total: Number(requestsByDate.get(date)?.total || 0),
          answered: Number(requestsByDate.get(date)?.answered || 0),
          missed: Number(requestsByDate.get(date)?.missed || 0),
        })),
      },
      branches,
      selectedBranch: branch || null,
      categories: categories.map((item) => ({
        ...item,
        count: Number(item.count),
        repeated: Number(item.repeated),
      })),
      subcategories: subcategories.map((item) => ({
        ...item,
        count: Number(item.count),
        repeated: Number(item.repeated),
      })),
      period,
      generatedAt: new Date().toISOString(),
    };
  }

  async getEvidenceFile(id: string) {
    const evidence = await this.evidenceRepo.findOne({
      where: { id },
      select: ['id', 'type', 'mediaData', 'mimeType'],
    });

    if (!evidence || !evidence.mediaData) {
      throw new NotFoundException('Fayl topilmadi yoki u bazada yo`q');
    }

    return evidence;
  }

  async revertFeedback(feedbackId: string) {
    const feedback = await this.feedbackRepo.findOne({
      where: { id: feedbackId },
      relations: ['request'],
    });

    if (!feedback) {
      throw new NotFoundException(`Отзыв с ID ${feedbackId} не найден`);
    }

    if (feedback.request) {
      feedback.request.status = RequestStatus.CONTACTED;
      await this.requestRepo.save(feedback.request);
    }

    return {
      success: true,
      message:
        'Статус заявки восстановлен. Отзыв, доказательства и карточка Trello сохранены.',
    };
  }
}
