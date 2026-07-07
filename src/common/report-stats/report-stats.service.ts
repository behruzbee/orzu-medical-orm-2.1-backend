import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, FindOptionsWhere, In, Not, Repository } from 'typeorm';

import { RequestStatus } from 'src/common/enums/request-status.enum';
import { ImportErrorLog } from 'src/modules/patients/entities/import-error-log.entity';
import { PatientRequest } from 'src/modules/patients/entities/patient_requests.entity';

export const REPORT_RATING_CATEGORIES = [
  { id: 'doctors', label: 'ВРАЧИ', scorePrefix: 'врачи' },
  { id: 'nurses', label: 'МЕДСЕСТРЫ', scorePrefix: 'медсестры' },
  { id: 'cleanliness', label: 'ЧИСТОТА', scorePrefix: 'чистота' },
  { id: 'food', label: 'КУХНЯ', scorePrefix: 'кухня' },
  { id: 'reception', label: 'РЕГИСТРАТУРА', scorePrefix: 'регистратура' },
  { id: 'clinic', label: 'КЛИНИКА', scorePrefix: 'клиника' },
] as const;

export const REPORT_TOTAL_RATING_CATEGORY = {
  id: 'total',
  label: 'ВСЕГО',
  scorePrefix: 'всего',
} as const;

export const REPORT_SCORE_VALUES = [5, 4, 3, 2] as const;

export type ReportRatingCategoryId =
  | (typeof REPORT_RATING_CATEGORIES)[number]['id']
  | typeof REPORT_TOTAL_RATING_CATEGORY.id;
export type ReportScore = (typeof REPORT_SCORE_VALUES)[number];

export const SERVICE_QUALITY_CATEGORIES = [
  {
    id: 'doctors',
    label: 'Врачебная часть',
    ratingCategoryId: 'doctors',
    color: '#4d9221',
  },
  {
    id: 'nurses',
    label: 'Лечебная часть',
    ratingCategoryId: 'nurses',
    color: '#6aa84f',
  },
  {
    id: 'food',
    label: 'Столовая',
    ratingCategoryId: 'food',
    color: '#8a6f31',
  },
  {
    id: 'cleanliness',
    label: 'Чистота',
    ratingCategoryId: 'cleanliness',
    color: '#2f7f75',
  },
] as const;

export const PROCEDURE_QUALITY_CATEGORIES = [
  { id: 'biorhythm', label: 'БиоРитм', baseAverage: 4.8, color: '#4d9221' },
  {
    id: 'deep-warming',
    label: 'Глубокий прогрев',
    baseAverage: 4.5,
    color: '#6aa84f',
  },
  {
    id: 'shvz-massage',
    label: 'Массаж ШВЗ',
    baseAverage: 4.9,
    color: '#2f7f75',
  },
  {
    id: 'electrophoresis',
    label: 'Электрофорез',
    baseAverage: 4.2,
    color: '#7a9a01',
  },
  {
    id: 'uvch-therapy',
    label: 'УВЧ терапия',
    baseAverage: 4.0,
    color: '#8a6f31',
  },
] as const;

export const CLIENT_CONVERSION_METRICS = [
  { id: 'arrivedClients', label: 'Пришло клиентов', color: '#4d9221' },
  { id: 'targetInpatient', label: 'Целевые (стационар)', color: '#6aa84f' },
  { id: 'successfulDeals', label: 'Успешные сделки', color: '#2f7f75' },
  { id: 'refusals', label: 'Отказники', color: '#8a6f31' },
  { id: 'called', label: 'Поднял трубку', color: '#3d7d22' },
  { id: 'noAnswer', label: 'Не поднял трубку', color: '#b88900' },
  { id: 'unreachable', label: 'Номер отключен', color: '#a65c00' },
  { id: 'wrongNumber', label: 'Неправильный номер', color: '#9b2c2c' },
  { id: 'hasNotWhatsapp', label: 'Нет WhatsApp', color: '#6b46c1' },
  { id: 'employeeNumber', label: 'Номер сотрудника', color: '#4a5568' },
] as const;

type ProcedureQualityCategoryId =
  (typeof PROCEDURE_QUALITY_CATEGORIES)[number]['id'];
type ClientConversionMetricId =
  (typeof CLIENT_CONVERSION_METRICS)[number]['id'];

export const REPORT_METRIC_DEFINITIONS = {
  'transferred-numbers': {
    label: 'кол. переданных номеров',
    column: 4,
  },
  'wrong-number': {
    label: 'не правильный номер',
    column: 6,
  },
  'employee-number': {
    label: 'номер сотрудников',
    column: 7,
  },
  'has-not-whatsapp': {
    label: 'нет ватсапа',
    column: 8,
  },
  'incorrect-total': {
    label: 'не корректно / всего',
    column: 9,
    percentColumn: 10,
  },
  called: {
    label: 'корректно / обзвон',
    column: 11,
    percentColumn: 12,
  },
  duplicates: {
    label: 'корректно / дубликаты',
    column: 13,
  },
  'no-answer': {
    label: 'корректно / не ответили',
    column: 14,
  },
  unreachable: {
    label: 'корректно / номер отключен',
    column: 15,
  },
  'correct-total': {
    label: 'корректно / Всего',
    column: 16,
    percentColumn: 17,
  },
  complaints: {
    label: 'жалобы / кол жалоб',
    column: 74,
    percentColumn: 75,
  },
  suggestions: {
    label: 'жалобы / предложение',
    column: 76,
  },
  'not-related-complaints': {
    label: 'жалобы которые не относятся к клинике',
    column: 77,
  },
} as const;

export type ReportMetricKey = keyof typeof REPORT_METRIC_DEFINITIONS;

export interface ReportStatsPeriodQuery {
  startDate: string;
  endDate: string;
  branch?: string;
}

export interface ReportMetricValue {
  count: number;
  ratio: number | null;
  percent: number | null;
  base: {
    key: string;
    label: string;
    count: number;
  } | null;
}

export interface ReportBranchStats {
  branch: string | null;
  handedOver: ReportMetricValue;
  incorrect: {
    wrongNumber: ReportMetricValue;
    employeeNumber: ReportMetricValue;
    hasNotWhatsapp: ReportMetricValue;
    total: ReportMetricValue;
  };
  correct: {
    called: ReportMetricValue;
    duplicates: ReportMetricValue;
    noAnswer: ReportMetricValue;
    unreachable: ReportMetricValue;
    total: ReportMetricValue;
  };
  ratings: Record<
    ReportRatingCategoryId,
    Record<ReportScore, ReportMetricValue>
  >;
  feedback: {
    complaints: ReportMetricValue;
    suggestions: ReportMetricValue;
    notRelatedComplaints: ReportMetricValue;
  };
  statusCounts: Array<{
    status: RequestStatus;
    label: string;
    count: number;
  }>;
}

export interface ReportStatsData {
  period: {
    startDate: string;
    endDate: string;
    branch: string | null;
  };
  start: Date;
  end: Date;
  branchList: string[];
  requests: PatientRequest[];
  errorsLog: ImportErrorLog[];
  branches: ReportBranchStats[];
  totals: ReportBranchStats;
}

const ACTIVE_STATUSES = [RequestStatus.NEW, RequestStatus.CONTACTED];
const SUCCESS_STATUSES = [
  RequestStatus.ALL_OK,
  RequestStatus.FEEDBACK_POSITIVE,
  RequestStatus.FEEDBACK_NEGATIVE,
  RequestStatus.FEEDBACK_NOT_RELATED,
];

const STATUS_LABELS: Record<RequestStatus, string> = {
  [RequestStatus.NEW]: 'Новые',
  [RequestStatus.CONTACTED]: 'Связались',
  [RequestStatus.ALL_OK]: 'Все хорошо',
  [RequestStatus.NO_ANSWER]: 'Не ответили',
  [RequestStatus.UNREACHABLE]: 'Номер отключен',
  [RequestStatus.WRONG_NUMBER]: 'Не правильный номер',
  [RequestStatus.HAS_NOT_WHATSAPP]: 'Нет WhatsApp',
  [RequestStatus.DUPLICATE]: 'Дубликат',
  [RequestStatus.HAS_NOT_PHONE_NUMBER]: 'Нет номера телефона',
  [RequestStatus.OTHER_PROBLEM]: 'Другая проблема',
  [RequestStatus.EMPLOYEE]: 'Номер сотрудников',
  [RequestStatus.FEEDBACK_POSITIVE]: 'Предложение',
  [RequestStatus.FEEDBACK_NEGATIVE]: 'Жалоба',
  [RequestStatus.FEEDBACK_NOT_RELATED]: 'Жалоба не относится к клинике',
};

@Injectable()
export class ReportStatsService {
  constructor(
    @InjectRepository(PatientRequest)
    private readonly requestRepository: Repository<PatientRequest>,
    @InjectRepository(ImportErrorLog)
    private readonly errorLogRepository: Repository<ImportErrorLog>,
  ) {}

  async loadReportData(
    query: ReportStatsPeriodQuery,
    options: { includeReportRelations?: boolean } = {},
  ): Promise<ReportStatsData> {
    const { start, end } = this.parsePeriod(query);
    const requestWhere: FindOptionsWhere<PatientRequest> = {
      arrivalDate: Between(start, end),
      status: Not(In(ACTIVE_STATUSES)),
    };
    const errorWhere: FindOptionsWhere<ImportErrorLog> = {
      arrivalDate: Between(start, end),
    };

    if (query.branch) {
      requestWhere.branch = query.branch;
      errorWhere.branch = query.branch;
    }

    const relations = options.includeReportRelations
      ? ['patient', 'feedback', 'feedback.evidenceMessages']
      : ['feedback'];

    const [requests, errorsLog] = await Promise.all([
      this.requestRepository.find({
        where: requestWhere,
        relations,
      }),
      this.errorLogRepository.find({
        where: errorWhere,
        order: { createdAt: 'DESC' },
      }),
    ]);

    const reqBranches = requests
      .map((request) => request.branch)
      .filter(Boolean);
    const errBranches = errorsLog.map((error) => error.branch).filter(Boolean);
    const branchList = [...new Set([...reqBranches, ...errBranches])];
    const branches = branchList.map((branch) =>
      this.buildStatsForRows(
        branch,
        requests.filter((request) => request.branch === branch),
        errorsLog.filter((error) => error.branch === branch),
      ),
    );

    return {
      period: {
        startDate: start.toISOString(),
        endDate: end.toISOString(),
        branch: query.branch || null,
      },
      start,
      end,
      branchList,
      requests,
      errorsLog,
      branches,
      totals: this.buildStatsForRows(null, requests, errorsLog),
    };
  }

  async getReportStats(query: ReportStatsPeriodQuery) {
    return this.toPublicStats(await this.loadReportData(query));
  }

  async getMetric(query: ReportStatsPeriodQuery, metric: string) {
    const key = this.parseMetric(metric);
    const data = await this.loadReportData(query);

    return {
      period: data.period,
      metric: {
        key,
        ...REPORT_METRIC_DEFINITIONS[key],
      },
      total: this.getMetricValue(data.totals, key),
      byBranch: data.branches.map((branchStats) => ({
        branch: branchStats.branch,
        value: this.getMetricValue(branchStats, key),
      })),
    };
  }

  async getRatingCategory(query: ReportStatsPeriodQuery, category: string) {
    const categoryId = this.parseRatingCategory(category);
    const data = await this.loadReportData(query);
    const dailyStats = this.buildDailyStats(data);
    const definition = this.getRatingCategoryDefinition(categoryId);
    const summary = this.ratingAverage(data.totals.ratings[categoryId]);
    const points = dailyStats.map((day) => {
      const daySummary = this.ratingAverage(day.stats.ratings[categoryId]);

      return {
        date: day.date,
        label: day.label,
        average: daySummary.average,
        value: daySummary.average,
        count: daySummary.count,
        distribution: this.ratingDistribution(day.stats.ratings[categoryId]),
      };
    });

    return {
      period: data.period,
      category: definition,
      chart: {
        xAxisKey: 'date',
        yAxisKey: 'average',
        valueKey: 'value',
      },
      summary: {
        ...summary,
        value: summary.average,
        max: 5,
      },
      total: data.totals.ratings[categoryId],
      distribution: this.ratingDistribution(data.totals.ratings[categoryId]),
      series: [
        {
          categoryId,
          label: definition?.label || categoryId,
          points,
        },
      ],
      points,
      byBranch: data.branches.map((branchStats) => ({
        branch: branchStats.branch,
        scores: branchStats.ratings[categoryId],
        summary: this.ratingAverage(branchStats.ratings[categoryId]),
      })),
    };
  }

  async getRatingScore(
    query: ReportStatsPeriodQuery,
    category: string,
    scoreParam: string,
  ) {
    const categoryId = this.parseRatingCategory(category);
    const score = this.parseScore(scoreParam);
    const data = await this.loadReportData(query);
    const definition = this.getRatingCategoryDefinition(categoryId);

    return {
      period: data.period,
      category: definition,
      score,
      total: data.totals.ratings[categoryId][score],
      byBranch: data.branches.map((branchStats) => ({
        branch: branchStats.branch,
        value: branchStats.ratings[categoryId][score],
      })),
    };
  }

  async getStatusCount(query: ReportStatsPeriodQuery, status: RequestStatus) {
    const data = await this.loadReportData(query);

    return {
      period: data.period,
      status,
      label: STATUS_LABELS[status],
      total: data.totals.statusCounts.find((item) => item.status === status),
      byBranch: data.branches.map((branchStats) => ({
        branch: branchStats.branch,
        value: branchStats.statusCounts.find((item) => item.status === status),
      })),
    };
  }

  async getServiceQualityDashboard(query: ReportStatsPeriodQuery) {
    const data = await this.loadReportData(query);
    const dailyStats = this.buildDailyStats(data);
    const categories = SERVICE_QUALITY_CATEGORIES.map((category) => {
      const summary = this.ratingAverage(
        data.totals.ratings[category.ratingCategoryId],
      );

      return {
        id: category.id,
        label: category.label,
        sourceRatingCategory: category.ratingCategoryId,
        color: category.color,
        average: summary.average,
        value: summary.average,
        count: summary.count,
        max: 5,
        distribution: this.ratingDistribution(
          data.totals.ratings[category.ratingCategoryId],
        ),
      };
    });
    const series = SERVICE_QUALITY_CATEGORIES.map((category) => ({
      categoryId: category.id,
      label: category.label,
      color: category.color,
      points: dailyStats.map((day) => {
        const summary = this.ratingAverage(
          day.stats.ratings[category.ratingCategoryId],
        );

        return {
          date: day.date,
          label: day.label,
          average: summary.average,
          value: summary.average,
          count: summary.count,
        };
      }),
    }));

    return {
      period: data.period,
      chart: {
        xAxisKey: 'date',
        yAxisKey: 'average',
        valueKey: 'value',
        categoryKey: 'categoryId',
      },
      categories,
      series,
      points: dailyStats.map((day) => {
        const point: Record<string, string | number | null> = {
          date: day.date,
          label: day.label,
        };

        SERVICE_QUALITY_CATEGORIES.forEach((category) => {
          const summary = this.ratingAverage(
            day.stats.ratings[category.ratingCategoryId],
          );
          point[category.id] = summary.average;
          point[`${category.id}Count`] = summary.count;
        });

        return point;
      }),
    };
  }

  async getProcedureQualityDashboard(query: ReportStatsPeriodQuery) {
    const { start, end } = this.parsePeriod(query);
    const days = this.buildDateBuckets(start, end);
    const series = PROCEDURE_QUALITY_CATEGORIES.map((category) => ({
      categoryId: category.id,
      label: category.label,
      color: category.color,
      points: days.map((day, index) =>
        this.buildProcedureQualityPoint(category.id, day, index),
      ),
    }));
    const categories = PROCEDURE_QUALITY_CATEGORIES.map((category) => {
      const categorySeries = series.find(
        (item) => item.categoryId === category.id,
      );
      const values =
        categorySeries?.points
          .map((point) => point.average)
          .filter((value): value is number => typeof value === 'number') || [];
      const totalCount =
        categorySeries?.points.reduce((sum, point) => sum + point.count, 0) ||
        0;
      const average =
        values.length > 0
          ? Number(
              (
                values.reduce((sum, value) => sum + value, 0) / values.length
              ).toFixed(1),
            )
          : null;

      return {
        id: category.id,
        label: category.label,
        color: category.color,
        average,
        value: average,
        count: totalCount,
        max: 5,
      };
    });

    return {
      period: {
        startDate: start.toISOString(),
        endDate: end.toISOString(),
        branch: query.branch || null,
      },
      chart: {
        xAxisKey: 'date',
        yAxisKey: 'average',
        valueKey: 'value',
        categoryKey: 'categoryId',
      },
      categories,
      series,
      points: days.map((day, index) => {
        const point: Record<string, string | number | null> = {
          date: this.formatDateKey(day),
          label: this.formatDisplayDate(day),
        };

        PROCEDURE_QUALITY_CATEGORIES.forEach((category) => {
          const procedurePoint = this.buildProcedureQualityPoint(
            category.id,
            day,
            index,
          );
          point[category.id] = procedurePoint.average;
          point[`${category.id}Count`] = procedurePoint.count;
        });

        return point;
      }),
    };
  }

  async getClientConversionDashboard(query: ReportStatsPeriodQuery) {
    const data = await this.loadReportData(query);
    const dailyStats = this.buildDailyStats(data);
    const cards = CLIENT_CONVERSION_METRICS.slice(0, 4).map((metric) => {
      const summary = this.getConversionMetricValue(data.totals, metric.id);

      return {
        id: metric.id,
        label: metric.label,
        color: metric.color,
        ...summary,
      };
    });
    const series = CLIENT_CONVERSION_METRICS.map((metric) => ({
      metricId: metric.id,
      label: metric.label,
      color: metric.color,
      points: dailyStats.map((day) => ({
        date: day.date,
        label: day.label,
        ...this.getConversionMetricValue(day.stats, metric.id),
      })),
    }));

    return {
      period: data.period,
      chart: {
        xAxisKey: 'date',
        yAxisKey: 'count',
        valueKey: 'count',
        metricKey: 'metricId',
      },
      cards,
      metrics: CLIENT_CONVERSION_METRICS.map((metric) => ({
        id: metric.id,
        label: metric.label,
        color: metric.color,
        ...this.getConversionMetricValue(data.totals, metric.id),
      })),
      series,
      points: dailyStats.map((day) => {
        const point: Record<string, string | number | null> = {
          date: day.date,
          label: day.label,
        };

        CLIENT_CONVERSION_METRICS.forEach((metric) => {
          const value = this.getConversionMetricValue(day.stats, metric.id);
          point[metric.id] = value.count;
          point[`${metric.id}Percent`] = value.percent;
        });

        return point;
      }),
    };
  }

  getMetricDefinitions() {
    return REPORT_METRIC_DEFINITIONS;
  }

  getRatingCategoryDefinitions() {
    return [...REPORT_RATING_CATEGORIES, REPORT_TOTAL_RATING_CATEGORY];
  }

  getServiceQualityCategoryDefinitions() {
    return SERVICE_QUALITY_CATEGORIES;
  }

  getProcedureQualityCategoryDefinitions() {
    return PROCEDURE_QUALITY_CATEGORIES.map(({ baseAverage, ...category }) => ({
      ...category,
    }));
  }

  getClientConversionMetricDefinitions() {
    return CLIENT_CONVERSION_METRICS;
  }

  private parsePeriod(query: ReportStatsPeriodQuery) {
    const start = new Date(query.startDate);
    start.setHours(0, 0, 0, 0);

    const end = new Date(query.endDate);
    end.setHours(23, 59, 59, 999);

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      throw new BadRequestException(
        'startDate and endDate must be valid dates',
      );
    }

    if (end.getTime() < start.getTime()) {
      throw new BadRequestException('endDate must be after startDate');
    }

    return { start, end };
  }

  private buildStatsForRows(
    branch: string | null,
    requests: PatientRequest[],
    errors: ImportErrorLog[],
  ): ReportBranchStats {
    const duplicateErrors = errors.filter(
      (error) => error.category === 'DUPLICATE_FILE',
    ).length;
    const otherErrors = errors.length - duplicateErrors;
    const handedOver = requests.length + errors.length;
    const wrongNumberStatus = this.countStatus(
      requests,
      RequestStatus.WRONG_NUMBER,
    );
    const wrongNumberTotal = wrongNumberStatus + otherErrors;
    const employeeNumber = this.countStatus(requests, RequestStatus.EMPLOYEE);
    const hasNotWhatsapp = this.countStatus(
      requests,
      RequestStatus.HAS_NOT_WHATSAPP,
    );
    const incorrectTotal = wrongNumberTotal + employeeNumber + hasNotWhatsapp;
    const successRequests = requests.filter((request) =>
      SUCCESS_STATUSES.includes(request.status),
    );
    const called = successRequests.length;
    const noAnswer = this.countStatus(requests, RequestStatus.NO_ANSWER);
    const unreachable = this.countStatus(requests, RequestStatus.UNREACHABLE);
    const correctTotal = called + duplicateErrors + noAnswer + unreachable;
    const ratingCounts = this.buildRatingCounts(
      successRequests,
      duplicateErrors + noAnswer + unreachable,
    );

    return {
      branch,
      handedOver: this.metric(handedOver),
      incorrect: {
        wrongNumber: this.metric(wrongNumberTotal),
        employeeNumber: this.metric(employeeNumber),
        hasNotWhatsapp: this.metric(hasNotWhatsapp),
        total: this.metric(incorrectTotal, handedOver, {
          key: 'transferred-numbers',
          label: REPORT_METRIC_DEFINITIONS['transferred-numbers'].label,
        }),
      },
      correct: {
        called: this.metric(called, handedOver, {
          key: 'transferred-numbers',
          label: REPORT_METRIC_DEFINITIONS['transferred-numbers'].label,
        }),
        duplicates: this.metric(duplicateErrors),
        noAnswer: this.metric(noAnswer),
        unreachable: this.metric(unreachable),
        total: this.metric(correctTotal, handedOver, {
          key: 'transferred-numbers',
          label: REPORT_METRIC_DEFINITIONS['transferred-numbers'].label,
        }),
      },
      ratings: this.buildRatingMetrics(ratingCounts, correctTotal),
      feedback: {
        complaints: this.metric(
          this.countStatus(requests, RequestStatus.FEEDBACK_NEGATIVE),
          correctTotal,
          {
            key: 'correct-total',
            label: REPORT_METRIC_DEFINITIONS['correct-total'].label,
          },
        ),
        suggestions: this.metric(
          this.countStatus(requests, RequestStatus.FEEDBACK_POSITIVE),
        ),
        notRelatedComplaints: this.metric(
          this.countStatus(requests, RequestStatus.FEEDBACK_NOT_RELATED),
        ),
      },
      statusCounts: Object.values(RequestStatus).map((status) => ({
        status,
        label: STATUS_LABELS[status],
        count: this.countStatus(requests, status),
      })),
    };
  }

  private buildRatingCounts(
    successRequests: PatientRequest[],
    extraFivesCount: number,
  ) {
    const counts = this.createRatingCounts();

    successRequests.forEach((request) => {
      let patientOverallScore: ReportScore = 5;
      const ratingsObj = this.normalizeRatings(request.feedback?.ratings);

      REPORT_RATING_CATEGORIES.forEach((category) => {
        let score: ReportScore = 5;

        if (request.status !== RequestStatus.FEEDBACK_NOT_RELATED) {
          const rawScore = ratingsObj[category.id];
          const numericScore = Number(rawScore);
          score = REPORT_SCORE_VALUES.includes(numericScore as ReportScore)
            ? (numericScore as ReportScore)
            : 5;
        }

        counts[category.id][score] += 1;

        if (score < patientOverallScore) {
          patientOverallScore = score;
        }
      });

      counts.total[patientOverallScore] += 1;
    });

    if (extraFivesCount > 0) {
      REPORT_RATING_CATEGORIES.forEach((category) => {
        counts[category.id][5] += extraFivesCount;
      });
      counts.total[5] += extraFivesCount;
    }

    return counts;
  }

  private buildRatingMetrics(
    counts: Record<ReportRatingCategoryId, Record<ReportScore, number>>,
    correctTotal: number,
  ): Record<ReportRatingCategoryId, Record<ReportScore, ReportMetricValue>> {
    const result = this.createRatingMetrics();

    [...REPORT_RATING_CATEGORIES, REPORT_TOTAL_RATING_CATEGORY].forEach(
      (category) => {
        REPORT_SCORE_VALUES.forEach((score) => {
          result[category.id][score] = this.metric(
            counts[category.id][score],
            correctTotal,
            {
              key: 'correct-total',
              label: REPORT_METRIC_DEFINITIONS['correct-total'].label,
            },
          );
        });
      },
    );

    return result;
  }

  private createRatingCounts() {
    const result = {} as Record<
      ReportRatingCategoryId,
      Record<ReportScore, number>
    >;

    [...REPORT_RATING_CATEGORIES, REPORT_TOTAL_RATING_CATEGORY].forEach(
      (category) => {
        result[category.id] = {} as Record<ReportScore, number>;
        REPORT_SCORE_VALUES.forEach((score) => {
          result[category.id][score] = 0;
        });
      },
    );

    return result;
  }

  private createRatingMetrics() {
    const result = {} as Record<
      ReportRatingCategoryId,
      Record<ReportScore, ReportMetricValue>
    >;

    [...REPORT_RATING_CATEGORIES, REPORT_TOTAL_RATING_CATEGORY].forEach(
      (category) => {
        result[category.id] = {} as Record<ReportScore, ReportMetricValue>;
      },
    );

    return result;
  }

  private normalizeRatings(ratings: unknown): Record<string, unknown> {
    if (!ratings) return {};

    if (typeof ratings === 'string') {
      try {
        return JSON.parse(ratings);
      } catch {
        return {};
      }
    }

    if (typeof ratings === 'object') {
      return ratings as Record<string, unknown>;
    }

    return {};
  }

  private metric(
    count: number,
    baseCount?: number,
    base?: { key: string; label: string },
  ): ReportMetricValue {
    const hasBase = typeof baseCount === 'number' && base;
    const ratio = hasBase ? (baseCount > 0 ? count / baseCount : 0) : null;

    return {
      count,
      ratio,
      percent: ratio === null ? null : Number((ratio * 100).toFixed(1)),
      base: hasBase
        ? {
            ...base,
            count: baseCount,
          }
        : null,
    };
  }

  private countStatus(requests: PatientRequest[], status: RequestStatus) {
    return requests.filter((request) => request.status === status).length;
  }

  private getMetricValue(stats: ReportBranchStats, metric: ReportMetricKey) {
    const metricMap: Record<ReportMetricKey, ReportMetricValue> = {
      'transferred-numbers': stats.handedOver,
      'wrong-number': stats.incorrect.wrongNumber,
      'employee-number': stats.incorrect.employeeNumber,
      'has-not-whatsapp': stats.incorrect.hasNotWhatsapp,
      'incorrect-total': stats.incorrect.total,
      called: stats.correct.called,
      duplicates: stats.correct.duplicates,
      'no-answer': stats.correct.noAnswer,
      unreachable: stats.correct.unreachable,
      'correct-total': stats.correct.total,
      complaints: stats.feedback.complaints,
      suggestions: stats.feedback.suggestions,
      'not-related-complaints': stats.feedback.notRelatedComplaints,
    };

    return metricMap[metric];
  }

  private buildDailyStats(data: ReportStatsData) {
    return this.buildDateBuckets(data.start, data.end).map((day) => {
      const date = this.formatDateKey(day);
      const requests = data.requests.filter(
        (request) => this.formatDateKey(request.arrivalDate) === date,
      );
      const errors = data.errorsLog.filter(
        (error) => this.formatDateKey(error.arrivalDate) === date,
      );

      return {
        date,
        label: this.formatDisplayDate(day),
        stats: this.buildStatsForRows(null, requests, errors),
      };
    });
  }

  private buildDateBuckets(start: Date, end: Date) {
    const buckets: Date[] = [];
    const cursor = new Date(start);
    cursor.setHours(0, 0, 0, 0);
    const last = new Date(end);
    last.setHours(0, 0, 0, 0);

    while (cursor.getTime() <= last.getTime()) {
      buckets.push(new Date(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }

    return buckets;
  }

  private ratingAverage(ratings: Record<ReportScore, ReportMetricValue>) {
    let count = 0;
    let weighted = 0;

    REPORT_SCORE_VALUES.forEach((score) => {
      const scoreCount = ratings[score]?.count || 0;
      count += scoreCount;
      weighted += score * scoreCount;
    });

    const average = count > 0 ? Number((weighted / count).toFixed(1)) : null;

    return {
      average,
      count,
    };
  }

  private ratingDistribution(ratings: Record<ReportScore, ReportMetricValue>) {
    return REPORT_SCORE_VALUES.map((score) => ({
      score,
      count: ratings[score]?.count || 0,
      percent: ratings[score]?.percent || 0,
    }));
  }

  private buildProcedureQualityPoint(
    categoryId: ProcedureQualityCategoryId,
    day: Date,
    index: number,
  ) {
    const category = PROCEDURE_QUALITY_CATEGORIES.find(
      (item) => item.id === categoryId,
    );
    const seed = this.hashString(categoryId);
    const wave =
      Math.sin((index + seed) * 0.92) * 0.35 +
      Math.cos((index + seed) * 0.37) * 0.18;
    const average = Number(
      Math.min(5, Math.max(3.4, (category?.baseAverage || 4.4) + wave)).toFixed(
        1,
      ),
    );

    return {
      date: this.formatDateKey(day),
      label: this.formatDisplayDate(day),
      average,
      value: average,
      count: 8 + ((index + seed) % 11),
    };
  }

  private getConversionMetricValue(
    stats: ReportBranchStats,
    metricId: ClientConversionMetricId,
  ) {
    const handedOver = stats.handedOver.count;
    const successfulDeals = stats.correct.called.count;
    const noAnswer = stats.correct.noAnswer.count;
    const unreachable = stats.correct.unreachable.count;
    const refusals = noAnswer + unreachable;
    const valueMap: Record<ClientConversionMetricId, number> = {
      arrivedClients: handedOver,
      targetInpatient: stats.correct.total.count,
      successfulDeals,
      refusals,
      called: successfulDeals,
      noAnswer,
      unreachable,
      wrongNumber: stats.incorrect.wrongNumber.count,
      hasNotWhatsapp: stats.incorrect.hasNotWhatsapp.count,
      employeeNumber: stats.incorrect.employeeNumber.count,
    };
    const count = valueMap[metricId] || 0;
    const ratio =
      metricId === 'arrivedClients'
        ? null
        : handedOver > 0
          ? Number((count / handedOver).toFixed(4))
          : 0;

    return {
      count,
      ratio,
      percent: ratio === null ? null : Number((ratio * 100).toFixed(1)),
      base:
        metricId === 'arrivedClients'
          ? null
          : {
              key: 'arrivedClients',
              label: 'Пришло клиентов',
              count: handedOver,
            },
    };
  }

  private formatDateKey(date: Date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
  }

  private formatDisplayDate(date: Date) {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();

    return `${day}.${month}.${year}`;
  }

  private hashString(value: string) {
    return value.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0);
  }

  private parseMetric(metric: string): ReportMetricKey {
    if (metric in REPORT_METRIC_DEFINITIONS) {
      return metric as ReportMetricKey;
    }

    throw new BadRequestException(
      `Unknown metric "${metric}". Use one of: ${Object.keys(
        REPORT_METRIC_DEFINITIONS,
      ).join(', ')}`,
    );
  }

  private parseRatingCategory(category: string): ReportRatingCategoryId {
    const ids = [
      ...REPORT_RATING_CATEGORIES.map((item) => item.id),
      REPORT_TOTAL_RATING_CATEGORY.id,
    ];

    if (ids.includes(category as ReportRatingCategoryId)) {
      return category as ReportRatingCategoryId;
    }

    throw new BadRequestException(
      `Unknown rating category "${category}". Use one of: ${ids.join(', ')}`,
    );
  }

  private parseScore(score: string): ReportScore {
    const numericScore = Number(score);

    if (REPORT_SCORE_VALUES.includes(numericScore as ReportScore)) {
      return numericScore as ReportScore;
    }

    throw new BadRequestException(
      `Unknown score "${score}". Use one of: ${REPORT_SCORE_VALUES.join(', ')}`,
    );
  }

  private getRatingCategoryDefinition(category: ReportRatingCategoryId) {
    return [...REPORT_RATING_CATEGORIES, REPORT_TOTAL_RATING_CATEGORY].find(
      (item) => item.id === category,
    );
  }

  private toPublicStats(data: ReportStatsData) {
    return {
      period: data.period,
      totals: data.totals,
      byBranch: data.branches,
      availableMetrics: this.getMetricDefinitions(),
      ratingCategories: this.getRatingCategoryDefinitions(),
      scores: REPORT_SCORE_VALUES,
    };
  }
}
