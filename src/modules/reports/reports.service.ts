import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, Not, In } from 'typeorm';
import * as ExcelJS from 'exceljs';
import { format } from 'date-fns';
import * as fs from 'fs/promises';
import * as path from 'path';

import { Report } from './entities/report.entity';
import { PatientRequest } from '../patients/entities/patient_requests.entity';
import { RequestStatus } from 'src/common/enums/request-status.enum';
import { GenerateReportDto } from './dto/generate-report.dto';
import { ImportErrorLog } from '../patients/entities/import-error-log.entity';

const CATEGORIES = [
  { id: 'doctors', prefix: 'врачи' },
  { id: 'nurses', prefix: 'медсестры' },
  { id: 'cleanliness', prefix: 'чистота' },
  { id: 'food', prefix: 'кухня' },
  { id: 'reception', prefix: 'общие вопросы' },
];

const SCORES = [5, 4, 3, 2];

const ERROR_CATEGORIES_MAPPING = {
  ACTIVE_REQUEST_EXISTS: 'Фаол ариза мавжуд (Уже в работе)',
  DUPLICATE_FILE: 'Файл ичида такрорий (Дубликат в файле)',
  DUPLICATE_DB: 'Базада такрорий (Дубликат в базе)',
  INVALID_PHONE: 'Нотугри телефон ракам (Неверный номер)',
  INVALID_DATES: 'Саналарда хатолик (Отрицательные или >15 дней)',
  MISSING_DATA: 'Маълумот тулик эмас (Нет ФИО/Телефона)',
  OTHER: 'Бошка хатоликлар (Прочие)',
};

@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);

  constructor(
    @InjectRepository(Report)
    private reportRepository: Repository<Report>,
    @InjectRepository(PatientRequest)
    private requestRepository: Repository<PatientRequest>,
    @InjectRepository(ImportErrorLog)
    private errorLogRepository: Repository<ImportErrorLog>,
  ) {}

  async findAll() {
    return this.reportRepository.find({
      order: { createdAt: 'DESC' },
    });
  }

  async generateReport(dto: GenerateReportDto) {
    const start = new Date(dto.startDate);
    start.setHours(0, 0, 0, 0);

    const end = new Date(dto.endDate);
    end.setHours(23, 59, 59, 999);

    // ==========================================
    // 1. ВЫБОРКА ДАННЫХ
    // ==========================================
    const requests = await this.requestRepository.find({
      where: {
        arrivalDate: Between(start, end),
        status: Not(In([RequestStatus.NEW, RequestStatus.CONTACTED])),
      },
      relations: ['patient', 'feedback', 'feedback.evidenceMessages'],
    });

    const errorsLog = await this.errorLogRepository.find({
      where: { arrivalDate: Between(start, end) },
      order: { createdAt: 'DESC' },
    });

    const workbook = new ExcelJS.Workbook();

    // ==========================================
    // 2. ВКЛАДКА 1: ОСНОВНОЙ ОТЧЕТ
    // ==========================================
    const worksheet = workbook.addWorksheet('Асосий хисобот (Отчет)');

    const dateRangeStr = `с ${format(start, 'dd.MM.yyyy')} по ${format(end, 'dd.MM.yyyy')}`;
    const titleText = `ОРЗУ МЕДИКАЛ клиникаларининг ${dateRangeStr} ётган беморларнинг кайта алокага олинганлар буйича курсаткичлари тугрисида`;

    worksheet.mergeCells('A1:BQ1');
    const titleRow = worksheet.getCell('A1');
    titleRow.value = titleText.toUpperCase();
    titleRow.font = { name: 'Times New Roman', size: 12, bold: true };
    titleRow.alignment = {
      vertical: 'middle',
      horizontal: 'center',
      wrapText: true,
    };
    worksheet.getRow(1).height = 40;

    worksheet.mergeCells('A2:BQ2');
    const subTitleRow = worksheet.getCell('A2');
    subTitleRow.value = 'М А Ъ Л У М О Т Н О М А';
    subTitleRow.font = { name: 'Times New Roman', size: 14, bold: true };
    subTitleRow.alignment = { vertical: 'middle', horizontal: 'center' };

    const row3 = worksheet.addRow([]);
    const row4 = worksheet.addRow([]);
    row3.height = 30;
    row4.height = 80;

    const fillStyle = (color: string) =>
      ({
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: color },
      }) as ExcelJS.Fill;
    const borderStyle = {
      top: { style: 'thin' },
      left: { style: 'thin' },
      bottom: { style: 'thin' },
      right: { style: 'thin' },
    } as Partial<ExcelJS.Borders>;
    const alignCenter = {
      horizontal: 'center',
      vertical: 'middle',
      wrapText: true,
    } as Partial<ExcelJS.Alignment>;
    const alignRotate = {
      horizontal: 'center',
      vertical: 'middle',
      wrapText: true,
      textRotation: 90,
    } as Partial<ExcelJS.Alignment>;

    const setupHeader = (
      colSpanStart: number,
      colSpanEnd: number,
      topLabel: string,
      subLabels: string[],
      color: string,
      rotateSub: boolean = false,
    ) => {
      if (colSpanStart === colSpanEnd) {
        worksheet.mergeCells(3, colSpanStart, 4, colSpanStart);
        const cell = row3.getCell(colSpanStart);
        cell.value = topLabel;
        cell.fill = fillStyle(color);
        cell.border = borderStyle;
        cell.alignment = alignCenter;
        cell.font = { bold: true };
        row4.getCell(colSpanStart).border = borderStyle;
      } else {
        worksheet.mergeCells(3, colSpanStart, 3, colSpanEnd);
        const topCell = row3.getCell(colSpanStart);
        topCell.value = topLabel;
        topCell.fill = fillStyle(color);
        topCell.border = borderStyle;
        topCell.alignment = alignCenter;
        topCell.font = { bold: true };

        subLabels.forEach((label, i) => {
          const cell = row4.getCell(colSpanStart + i);
          cell.value = label;
          cell.fill = fillStyle(color);
          cell.border = borderStyle;
          cell.alignment = rotateSub ? alignRotate : alignCenter;
          cell.font = { bold: true };
        });
      }
    };

    const C_GRAY = 'FFE7E6E6';
    const C_RED = 'FFF8CBAD';
    const C_GREEN = 'FFC6E0B4';
    const C_BLUE = 'FFB4C6E7';
    const C_YELLOW = 'FFFFE699';
    const C_ORANGE = 'FFF4B084';
    const C_CYAN = 'FFA9D08E';
    const C_PURPLE = 'FFD9E1F2';
    const C_GOLD = 'FFFFD966';
    const C_PINK = 'FFF4CCCC';

    setupHeader(1, 1, '№', [], C_GRAY);
    setupHeader(2, 2, 'филиал', [], C_GRAY);
    setupHeader(3, 3, 'кол пациентов за мес', [], C_GRAY);
    setupHeader(4, 4, 'кол. переданных номеров', [], C_GRAY);
    setupHeader(5, 5, '%', [], C_GRAY);
    setupHeader(
      6,
      10,
      'не корректно',
      ['не правильный номер', 'номер сотрудников', 'нет ватсапа', 'всего', '%'],
      C_RED,
      true,
    );
    setupHeader(
      11,
      16,
      'корректно',
      ['обзвон', '%', 'не ответили', 'номер отключен', 'Всего', '%'],
      C_GREEN,
      true,
    );

    const catConfigs = [
      { name: 'ВРАЧИ', color: C_BLUE },
      { name: 'МЕДСЕСТРЫ', color: C_YELLOW },
      { name: 'ЧИСТОТА', color: C_ORANGE },
      { name: 'КУХНЯ', color: C_CYAN },
      { name: 'ОБЩИЕ ВОПРОСЫ ПО КЛИНИКЕ', color: C_PURPLE },
      { name: 'ВСЕГО', color: C_GOLD },
    ];

    let colIdx = 17;
    CATEGORIES.forEach((cat, index) => {
      const subLabels = SCORES.map((s) => [`${cat.prefix} ${s}`, '%']).flat();
      setupHeader(
        colIdx,
        colIdx + 7,
        catConfigs[index].name,
        subLabels,
        catConfigs[index].color,
        true,
      );
      colIdx += 8;
    });

    const totalSubLabels = SCORES.map((s) => [`всего ${s}`, '%']).flat();
    setupHeader(
      colIdx,
      colIdx + 7,
      catConfigs[5].name,
      totalSubLabels,
      catConfigs[5].color,
      true,
    );

    // ИСПРАВЛЕНИЕ ЗАГОЛОВКА ДЛЯ ДРУГИХ ЖАЛОБ
    setupHeader(
      65,
      69,
      'жалобы',
      [
        'кол жалоб',
        '%',
        'предложение',
        'жалобы каторые не относиться к клинике',
        'ссылка',
      ],
      C_PINK,
      true,
    );

    const reqBranches = requests.map((r) => r.branch).filter(Boolean);
    const errBranches = errorsLog.map((e) => e.branch).filter(Boolean);
    const branchList = [...new Set([...reqBranches, ...errBranches])];

    const totals = {
      handedOver: 0,
      wrongNum: 0,
      noWa: 0,
      incorrectTotal: 0,
      obzvon: 0,
      noAnswer: 0,
      unreachable: 0,
      correctTotal: 0,
      feedNeg: 0,
      feedPos: 0,
      feedNotRel: 0,
      ratingsCount: {} as Record<string, number>,
      allRatingsCount: {} as Record<number, number>,
    };

    branchList.forEach((branch, index) => {
      const bReqs = requests.filter((r) => r.branch === branch);
      const bErrors = errorsLog.filter((e) => e.branch === branch);

      const bHandedOver = bReqs.length + bErrors.length;

      const bWrongNumberStatus = bReqs.filter(
        (r) => r.status === RequestStatus.WRONG_NUMBER,
      ).length;
      const bWrongNumTotal = bErrors.length + bWrongNumberStatus;

      const bEmpNum = null;

      const bNoWa = bReqs.filter(
        (r) => r.status === RequestStatus.HAS_NOT_WHATSAPP,
      ).length;

      const bIncorrectTotal = bWrongNumTotal + (bEmpNum || 0) + bNoWa;

      const successRequests = bReqs.filter((r) =>
        [
          RequestStatus.ALL_OK,
          RequestStatus.FEEDBACK_POSITIVE,
          RequestStatus.FEEDBACK_NEGATIVE,
          RequestStatus.FEEDBACK_NOT_RELATED,
        ].includes(r.status),
      );
      const bObzvon = successRequests.length;

      const bNoAnswer = bReqs.filter(
        (r) => r.status === RequestStatus.NO_ANSWER,
      ).length;
      const bUnreachable = bReqs.filter(
        (r) => r.status === RequestStatus.UNREACHABLE,
      ).length;

      const bCorrectTotal = bObzvon + bNoAnswer + bUnreachable;

      const bFeedNeg = bReqs.filter(
        (r) => r.status === RequestStatus.FEEDBACK_NEGATIVE,
      ).length;
      const bFeedPos = bReqs.filter(
        (r) => r.status === RequestStatus.FEEDBACK_POSITIVE,
      ).length;
      const bFeedNotRel = bReqs.filter(
        (r) => r.status === RequestStatus.FEEDBACK_NOT_RELATED,
      ).length;

      const branchRatings: Record<string, number> = {};
      const branchTotalScores: Record<number, number> = {
        5: 0,
        4: 0,
        3: 0,
        2: 0,
      };

      // ИСПРАВЛЕНИЕ ПОДСЧЕТА 'ВСЕГО'
      successRequests.forEach((req) => {
        let reqTotalScore = 0; // Сумма всех оценок для 1 пациента

        CATEGORIES.forEach((cat) => {
          let score = 5;
          if (req.status === RequestStatus.FEEDBACK_NEGATIVE) {
            score = req.feedback?.ratings?.[cat.id] || 5;
          }
          if (!SCORES.includes(score)) score = 5;

          const key = `${cat.id}-${score}`;
          branchRatings[key] = (branchRatings[key] || 0) + 1;
          totals.ratingsCount[key] = (totals.ratingsCount[key] || 0) + 1;

          reqTotalScore += score;
        });

        // Высчитываем среднюю общую оценку пациента
        let overallScore = Math.round(reqTotalScore / CATEGORIES.length);
        if (!SCORES.includes(overallScore)) overallScore = 5;

        // Прибавляем строго +1 за одного пациента в ИТОГО
        branchTotalScores[overallScore] += 1;
        totals.allRatingsCount[overallScore] =
          (totals.allRatingsCount[overallScore] || 0) + 1;
      });

      const rowValues = Array(70).fill(null);
      rowValues[1] = index + 1;
      rowValues[2] = branch;
      rowValues[3] = null;
      rowValues[4] = bHandedOver;
      rowValues[5] = null;

      rowValues[6] = bWrongNumTotal;
      rowValues[7] = bEmpNum;
      rowValues[8] = bNoWa;
      rowValues[9] = bIncorrectTotal;
      rowValues[10] = bHandedOver ? bIncorrectTotal / bHandedOver : 0;

      rowValues[11] = bObzvon;
      rowValues[12] = bHandedOver ? bObzvon / bHandedOver : 0;
      rowValues[13] = bNoAnswer;
      rowValues[14] = bUnreachable;
      rowValues[15] = bCorrectTotal;
      rowValues[16] = bHandedOver ? bCorrectTotal / bHandedOver : 0;

      let cIdx = 17;
      CATEGORIES.forEach((cat) => {
        SCORES.forEach((s) => {
          const count = branchRatings[`${cat.id}-${s}`] || 0;
          rowValues[cIdx++] = count;
          rowValues[cIdx++] = bObzvon > 0 ? count / bObzvon : 0;
        });
      });
      SCORES.forEach((s) => {
        const count = branchTotalScores[s] || 0;
        rowValues[cIdx++] = count;
        rowValues[cIdx++] = bObzvon > 0 ? count / bObzvon : 0;
      });

      rowValues[65] = bFeedNeg;
      rowValues[66] = bObzvon ? bFeedNeg / bObzvon : 0;
      rowValues[67] = bFeedPos;
      rowValues[68] = bFeedNotRel;
      rowValues[69] = 'Вкладка "Ссылки"';

      const row = worksheet.addRow(rowValues.slice(1));

      [10, 12, 16, 66].forEach((c) => {
        row.getCell(c).numFmt = '0.0%';
      });

      let pIdx = 17;
      for (let i = 0; i < 24; i++) {
        pIdx++;
        row.getCell(pIdx++).numFmt = '0.0%';
      }

      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        cell.border = borderStyle;
        cell.alignment = alignCenter;
        if (colNumber === 69) {
          cell.font = {
            color: { argb: '0000FF' },
            underline: true,
            italic: true,
          };
        }
        if (cell.value === 0 || cell.value === '0 (0.0%)') cell.value = '';
      });

      totals.handedOver += bHandedOver;
      totals.incorrectTotal += bIncorrectTotal;
      totals.wrongNum += bWrongNumTotal;
      totals.noWa += bNoWa;
      totals.obzvon += bObzvon;
      totals.noAnswer += bNoAnswer;
      totals.unreachable += bUnreachable;
      totals.correctTotal += bCorrectTotal;
      totals.feedNeg += bFeedNeg;
      totals.feedPos += bFeedPos;
      totals.feedNotRel += bFeedNotRel;
    });

    // ИТОГО
    const totalRowValues = Array(70).fill(null);
    totalRowValues[1] = 'ИТОГО';
    totalRowValues[3] = null;
    totalRowValues[4] = totals.handedOver;
    totalRowValues[5] = null;

    totalRowValues[6] = totals.wrongNum;
    totalRowValues[7] = null;
    totalRowValues[8] = totals.noWa;
    totalRowValues[9] = totals.incorrectTotal;
    totalRowValues[10] = totals.handedOver
      ? totals.incorrectTotal / totals.handedOver
      : 0;

    totalRowValues[11] = totals.obzvon;
    totalRowValues[12] = totals.handedOver
      ? totals.obzvon / totals.handedOver
      : 0;
    totalRowValues[13] = totals.noAnswer;
    totalRowValues[14] = totals.unreachable;
    totalRowValues[15] = totals.correctTotal;
    totalRowValues[16] = totals.handedOver
      ? totals.correctTotal / totals.handedOver
      : 0;

    let totalCIdx = 17;
    CATEGORIES.forEach((cat) => {
      SCORES.forEach((s) => {
        const count = totals.ratingsCount[`${cat.id}-${s}`] || 0;
        totalRowValues[totalCIdx++] = count;
        totalRowValues[totalCIdx++] =
          totals.obzvon > 0 ? count / totals.obzvon : 0;
      });
    });
    SCORES.forEach((s) => {
      const count = totals.allRatingsCount[s] || 0;
      totalRowValues[totalCIdx++] = count;
      totalRowValues[totalCIdx++] =
        totals.obzvon > 0 ? count / totals.obzvon : 0;
    });

    totalRowValues[65] = totals.feedNeg;
    totalRowValues[66] = totals.obzvon ? totals.feedNeg / totals.obzvon : 0;
    totalRowValues[67] = totals.feedPos;
    totalRowValues[68] = totals.feedNotRel;

    const totalRow = worksheet.addRow(totalRowValues.slice(1));
    worksheet.mergeCells(`A${totalRow.number}:C${totalRow.number}`);
    totalRow.font = { bold: true };

    totalRow.eachCell({ includeEmpty: true }, (cell) => {
      cell.fill = fillStyle(C_GRAY);
      cell.border = borderStyle;
      cell.alignment = alignCenter;
      if (cell.value === 0 || cell.value === '0 (0.0%)') cell.value = '';
    });

    [10, 12, 16, 66].forEach((c) => {
      totalRow.getCell(c).numFmt = '0.0%';
    });

    totalCIdx = 17;
    for (let i = 0; i < 24; i++) {
      totalCIdx++;
      totalRow.getCell(totalCIdx++).numFmt = '0.0%';
    }

    worksheet.columns.forEach((col, i) => {
      if (i === 1) col.width = 20;
      else if (i === 68) col.width = 18;
      else col.width = 7.5;
    });

    // ==========================================
    // 3. ВКЛАДКА 2: ССЫЛКИ И МЕДИА
    // ==========================================
    const linksSheet = workbook.addWorksheet('Хаволалар (Ссылки)');
    linksSheet.addRow([
      'ДЕТАЛИЗАЦИЯ ЖАЛОБ И ПРЕДЛОЖЕНИЙ (ССЫЛКИ TRELLO И ФАЙЛЫ)',
    ]);
    linksSheet.mergeCells('A1:G1');
    linksSheet.getCell('A1').font = { bold: true, size: 12 };
    linksSheet.getCell('A1').alignment = {
      horizontal: 'center',
      vertical: 'middle',
    };
    linksSheet.getRow(1).height = 30;

    const linkHeaders = [
      '№',
      'Филиал',
      'Бемор (Пациент)',
      'Телефон',
      'Тип',
      'Trello URL',
      'Файлы (Медиа)',
    ];
    const lRow = linksSheet.addRow(linkHeaders);
    lRow.eachCell((c) => {
      c.fill = fillStyle(C_GRAY);
      c.font = { bold: true };
      c.border = borderStyle;
      c.alignment = alignCenter;
    });

    let linkIndex = 1;
    branchList.forEach((branch) => {
      const bReqs = requests.filter(
        (r) =>
          r.branch === branch &&
          [
            RequestStatus.FEEDBACK_NEGATIVE,
            RequestStatus.FEEDBACK_POSITIVE,
            RequestStatus.FEEDBACK_NOT_RELATED,
          ].includes(r.status),
      );
      const itemsToPrint = bReqs.filter(
        (r) =>
          r.feedback?.trelloUrl ||
          (r.feedback?.evidenceMessages &&
            r.feedback.evidenceMessages.length > 0),
      );

      if (itemsToPrint.length === 0) return;

      // @ts-ignore
      const startRow = linksSheet.lastRow.number + 1;
      itemsToPrint.forEach((req) => {
        let typeStr = 'Жалоба (Шикоят)';
        if (req.status === RequestStatus.FEEDBACK_POSITIVE)
          typeStr = 'Предложение (Таклиф)';
        else if (req.status === RequestStatus.FEEDBACK_NOT_RELATED)
          typeStr = 'Другое (Клиникага тегишли эмас)';

        const trelloCell = req.feedback?.trelloUrl
          ? { text: 'Перейти в Trello', hyperlink: req.feedback.trelloUrl }
          : '-';
        let mediaCell: any = '-';

        if (req.feedback?.evidenceMessages?.length > 0) {
          const mediaLinks = req.feedback.evidenceMessages
            .map((e) => e.mediaUrl)
            .filter(Boolean);
          if (mediaLinks.length === 1) {
            mediaCell = { text: 'Открыть файл', hyperlink: mediaLinks[0] };
          } else if (mediaLinks.length > 1) {
            mediaCell = {
              text: `Файлов: ${mediaLinks.length} (Нажмите для открытия 1-го)`,
              hyperlink: mediaLinks[0],
            };
          }
        }

        const row = linksSheet.addRow([
          linkIndex++,
          branch,
          req.patient?.name || '-',
          req.patient?.phone || '-',
          typeStr,
          trelloCell,
          mediaCell,
        ]);

        row.eachCell({ includeEmpty: true }, (c, colNum) => {
          c.border = borderStyle;
          c.alignment = alignCenter;
          if ((colNum === 6 || colNum === 7) && c.value !== '-')
            c.font = { color: { argb: '0000FF' }, underline: true };
        });
      });

      // @ts-ignore
      const endRow = linksSheet.lastRow.number;
      if (endRow > startRow) {
        linksSheet.mergeCells(startRow, 2, endRow, 2);
      }
    });

    linksSheet.columns.forEach((c, i) => {
      if (i === 0) c.width = 6;
      else if (i === 1) c.width = 20;
      else if (i === 2) c.width = 30;
      else if (i === 3) c.width = 20;
      else if (i === 4) c.width = 25;
      else c.width = 25;
    });

    // ==========================================
    // 4. ВКЛАДКА 3: ОШИБКИ ИМПОРТА
    // ==========================================
    const errorSheet = workbook.addWorksheet('Импорт хатоликлари (Ошибки)');
    const totalErrors = errorsLog.length;

    errorSheet.addRow(['ИМПОРТ ҚИЛИШДАГИ ХАТОЛИКЛАР СТАТИСТИКАСИ']);
    errorSheet.mergeCells('A1:C1');
    errorSheet.getCell('A1').font = { bold: true, size: 12 };
    errorSheet.getCell('A1').alignment = { horizontal: 'center' };

    errorSheet.addRow([
      'Хатолик тури (Категория)',
      'Сони (Кол-во)',
      'Улуши (%)',
    ]);
    // @ts-ignore
    errorSheet.lastRow.font = { bold: true };
    // @ts-ignore
    errorSheet.lastRow.eachCell((c) => {
      c.fill = fillStyle(C_GRAY);
      c.border = borderStyle;
    });

    const categoryCounts: Record<string, number> = {};
    errorsLog.forEach((e) => {
      categoryCounts[e.category] = (categoryCounts[e.category] || 0) + 1;
    });

    Object.keys(ERROR_CATEGORIES_MAPPING).forEach((cat) => {
      const count = categoryCounts[cat] || 0;
      const row = errorSheet.addRow([
        ERROR_CATEGORIES_MAPPING[cat as keyof typeof ERROR_CATEGORIES_MAPPING],
        count,
        totalErrors ? count / totalErrors : 0,
      ]);
      row.getCell(3).numFmt = '0.0%';
      row.eachCell((c) => (c.border = borderStyle));
    });

    const errTotalRow = errorSheet.addRow(['ЖАМИ (ИТОГО)', totalErrors, 1]);
    errTotalRow.font = { bold: true };
    errTotalRow.getCell(3).numFmt = '0.0%';
    errTotalRow.eachCell((c) => (c.border = borderStyle));

    errorSheet.addRow([]);

    errorSheet.addRow(['ХАТОЛИКЛАР ТАФСИЛОТИ (Детализация ошибок)']);
    errorSheet.mergeCells(
      // @ts-ignore
      `A${errorSheet.lastRow.number}:H${errorSheet.lastRow.number}`,
    );
    // @ts-ignore
    errorSheet.lastRow.font = { bold: true, size: 12 };
    // @ts-ignore
    errorSheet.lastRow.alignment = { horizontal: 'center' };

    const detRow = errorSheet.addRow([
      '№',
      'Келган сана',
      'Юкланган сана',
      'Қатор (Excel)',
      'Ф.И.Ш (Имя)',
      'Телефон',
      'Филиал',
      'Изох (Ошибка)',
    ]);
    detRow.font = { bold: true };
    detRow.eachCell((c) => {
      c.fill = fillStyle(C_GRAY);
      c.border = borderStyle;
      c.alignment = alignCenter;
    });

    errorsLog.forEach((e, i) => {
      const mappedCategory =
        ERROR_CATEGORIES_MAPPING[
          e.category as keyof typeof ERROR_CATEGORIES_MAPPING
        ] || e.category;
      const row = errorSheet.addRow([
        i + 1,
        format(e.arrivalDate, 'dd.MM.yyyy'),
        format(e.createdAt, 'dd.MM.yyyy HH:mm'),
        e.lineNumber,
        e.name || '-',
        e.phone || '-',
        e.branch || '-',
        `[${mappedCategory}] - ${e.errorMessages.join('; ')}`,
      ]);
      row.eachCell((c) => (c.border = borderStyle));
    });

    errorSheet.columns.forEach((c, i) => {
      if (i === 0) c.width = 6;
      else if (i === 1 || i === 2) c.width = 20;
      else if (i === 4) c.width = 30;
      else if (i === 5) c.width = 20;
      else if (i === 6) c.width = 25;
      else if (i === 7) c.width = 70;
      else c.width = 15;
    });

    // ==========================================
    // 5. СОХРАНЕНИЕ ФАЙЛА
    // ==========================================
    const uint8Array = await workbook.xlsx.writeBuffer();
    const buffer = Buffer.from(uint8Array);

    const fileName = `Отчет_${format(start, 'dd.MM.yyyy')}-${format(end, 'dd.MM.yyyy')}_${Date.now()}.xlsx`;
    const uploadDir = path.join(process.cwd(), 'uploads', 'reports');
    await fs.mkdir(uploadDir, { recursive: true });

    const filePath = path.join(uploadDir, fileName);
    await fs.writeFile(filePath, buffer);

    const backendUrl =
      process.env.UPLOAD_URL ||
      process.env.BACKEND_URL ||
      'http://localhost:3000';
    return this.reportRepository.save(
      this.reportRepository.create({
        name: fileName,
        fileUrl: `${backendUrl}/uploads/reports/${fileName}`,
        startDate: start,
        endDate: end,
        status: 'ready',
      }),
    );
  }

  async remove(id: string) {
    const report = await this.reportRepository.findOne({ where: { id } });
    if (report) {
      try {
        const fileName = report.fileUrl.split('/').pop();
        if (fileName) {
          await fs.unlink(
            path.join(process.cwd(), 'uploads', 'reports', fileName),
          );
        }
      } catch (e: any) {
        this.logger.warn(
          `Could not delete file for report ${id}: ${e.message}`,
        );
      }
      return this.reportRepository.delete(id);
    }
  }
}
