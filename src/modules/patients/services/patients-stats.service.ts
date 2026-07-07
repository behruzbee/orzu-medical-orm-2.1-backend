import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, FindOptionsWhere, In, Not, Repository } from 'typeorm';
import { RequestStatus } from 'src/common/enums/request-status.enum'; // Исправлено на RequestStatus
import { formatBranchName } from 'src/common/utils/branch.util';
import { PatientRequest } from '../entities/patient_requests.entity'; // Используем PatientRequest вместо Patient
import { ImportErrorLog } from '../entities/import-error-log.entity';
import { StatsPeriodQueryDto } from '../dto/stats-period-query.dto';

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

const SUCCESS_STATUSES = [
  RequestStatus.ALL_OK,
  RequestStatus.FEEDBACK_POSITIVE,
  RequestStatus.FEEDBACK_NEGATIVE,
  RequestStatus.FEEDBACK_NOT_RELATED,
];

const ACTIVE_STATUSES = [RequestStatus.NEW, RequestStatus.CONTACTED];

@Injectable()
export class PatientsStatsService {
  constructor(
    @InjectRepository(PatientRequest)
    private requestRepo: Repository<PatientRequest>, // Меняем репозиторий
    @InjectRepository(ImportErrorLog)
    private errorLogRepository: Repository<ImportErrorLog>,
  ) {}

  async getStats() {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const totalTasks = await this.requestRepo.count({
      where: {
        status: In([RequestStatus.NEW, RequestStatus.CONTACTED]),
      },
    });

    const newTasks = await this.requestRepo.count({
      where: {
        createdAt: Between(todayStart, todayEnd),
        status: In([RequestStatus.NEW, RequestStatus.CONTACTED]),
      },
    });

    const callBackTasks = await this.requestRepo.count({
      where: {
        status: RequestStatus.CONTACTED,
        updatedAt: Between(todayStart, todayEnd),
      },
    });

    const completedTasks = await this.requestRepo.count({
      where: {
        status: Not(In([RequestStatus.NEW, RequestStatus.CONTACTED])),
        updatedAt: Between(todayStart, todayEnd),
      },
    });

    return {
      totalTasks,
      newTasks,
      callBackTasks,
      completedTasks,
    };
  }

  async getPeriodStats(query: StatsPeriodQueryDto) {
    const { start, end } = this.parsePeriod(query);
    const requestWhere: FindOptionsWhere<PatientRequest> = {
      arrivalDate: Between(start, end),
    };
    const errorWhere: FindOptionsWhere<ImportErrorLog> = {
      arrivalDate: Between(start, end),
    };

    if (query.branch) {
      requestWhere.branch = query.branch;
      errorWhere.branch = query.branch;
    }

    const [requests, errors] = await Promise.all([
      this.requestRepo.find({ where: requestWhere }),
      this.errorLogRepository.find({ where: errorWhere }),
    ]);

    const branches = Array.from(
      new Set([
        ...requests.map((request) => request.branch).filter(Boolean),
        ...errors.map((error) => error.branch).filter(Boolean),
      ]),
    ).sort((a, b) => a.localeCompare(b));

    return {
      period: {
        startDate: start.toISOString(),
        endDate: end.toISOString(),
        branch: formatBranchName(query.branch),
      },
      totals: this.buildPeriodSummary(requests, errors),
      byBranch: branches.map((branch) => ({
        branch: formatBranchName(branch),
        ...this.buildPeriodSummary(
          requests.filter((request) => request.branch === branch),
          errors.filter((error) => error.branch === branch),
        ),
      })),
    };
  }

  async getStatusPeriodStats(
    status: RequestStatus,
    query: StatsPeriodQueryDto,
  ) {
    const { start, end } = this.parsePeriod(query);
    const where: FindOptionsWhere<PatientRequest> = {
      arrivalDate: Between(start, end),
      status,
    };

    if (query.branch) {
      where.branch = query.branch;
    }

    const count = await this.requestRepo.count({ where });

    return {
      period: {
        startDate: start.toISOString(),
        endDate: end.toISOString(),
        branch: formatBranchName(query.branch),
      },
      status,
      label: STATUS_LABELS[status],
      count,
    };
  }

  private parsePeriod(query: StatsPeriodQueryDto) {
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

  private buildPeriodSummary(
    requests: PatientRequest[],
    errors: ImportErrorLog[],
  ) {
    const processedRequests = requests.filter(
      (request) => !ACTIVE_STATUSES.includes(request.status),
    );
    const duplicateErrors = errors.filter((error) =>
      ['DUPLICATE_FILE', 'DUPLICATE_DB'].includes(error.category),
    ).length;
    const nonDuplicateErrors = errors.length - duplicateErrors;

    const wrongNumber = this.countStatus(
      processedRequests,
      RequestStatus.WRONG_NUMBER,
    );
    const employeeNumber = this.countStatus(
      processedRequests,
      RequestStatus.EMPLOYEE,
    );
    const hasNotWhatsapp = this.countStatus(
      processedRequests,
      RequestStatus.HAS_NOT_WHATSAPP,
    );
    const incorrectTotal =
      wrongNumber + nonDuplicateErrors + employeeNumber + hasNotWhatsapp;

    const called = processedRequests.filter((request) =>
      SUCCESS_STATUSES.includes(request.status),
    ).length;
    const noAnswer = this.countStatus(
      processedRequests,
      RequestStatus.NO_ANSWER,
    );
    const unreachable = this.countStatus(
      processedRequests,
      RequestStatus.UNREACHABLE,
    );
    const correctTotal = called + duplicateErrors + noAnswer + unreachable;
    const transferredNumbers = processedRequests.length + errors.length;

    const statusCounts = Object.values(RequestStatus).map((status) => {
      const count = this.countStatus(requests, status);

      return {
        status,
        label: STATUS_LABELS[status],
        count,
        percentOfRequests: this.percent(count, requests.length),
      };
    });

    const importErrorCategories = errors.reduce<Record<string, number>>(
      (acc, error) => {
        acc[error.category] = (acc[error.category] || 0) + 1;
        return acc;
      },
      {},
    );

    return {
      transferredNumbers,
      requestRows: requests.length,
      processedRequestRows: processedRequests.length,
      activeRequestRows: requests.length - processedRequests.length,
      importErrors: {
        total: errors.length,
        duplicateErrors,
        nonDuplicateErrors,
        categories: importErrorCategories,
      },
      incorrect: {
        wrongNumber: wrongNumber + nonDuplicateErrors,
        employeeNumber,
        hasNotWhatsapp,
        total: incorrectTotal,
        percentOfTransferredNumbers: this.percent(
          incorrectTotal,
          transferredNumbers,
        ),
      },
      correct: {
        called,
        duplicates: duplicateErrors,
        noAnswer,
        unreachable,
        total: correctTotal,
        percentOfTransferredNumbers: this.percent(
          correctTotal,
          transferredNumbers,
        ),
      },
      feedback: {
        complaints: this.countStatus(
          processedRequests,
          RequestStatus.FEEDBACK_NEGATIVE,
        ),
        suggestions: this.countStatus(
          processedRequests,
          RequestStatus.FEEDBACK_POSITIVE,
        ),
        notRelatedToClinic: this.countStatus(
          processedRequests,
          RequestStatus.FEEDBACK_NOT_RELATED,
        ),
      },
      statusCounts,
    };
  }

  private countStatus(requests: PatientRequest[], status: RequestStatus) {
    return requests.filter((request) => request.status === status).length;
  }

  private percent(count: number, total: number) {
    if (!total) return 0;
    return Number(((count / total) * 100).toFixed(1));
  }
}
