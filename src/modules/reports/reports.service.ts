import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as ExcelJS from 'exceljs';
import { format } from 'date-fns';
import * as fs from 'fs/promises';
import * as path from 'path';

import { Report } from './entities/report.entity';
import { RequestStatus } from 'src/common/enums/request-status.enum';
import { GenerateReportDto } from './dto/generate-report.dto';
import {
  REPORT_RATING_CATEGORIES,
  REPORT_SCORE_VALUES,
  REPORT_TOTAL_RATING_CATEGORY,
  ReportStatsService,
} from 'src/common/report-stats/report-stats.service';

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
    private readonly reportStatsService: ReportStatsService,
  ) {}

  async findAll() {
    return this.reportRepository.find({
      order: { createdAt: 'DESC' },
    });
  }

  async generateReport(dto: GenerateReportDto) {
    const reportData = await this.reportStatsService.loadReportData(dto, {
      includeReportRelations: true,
    });
    const { start, end, requests, errorsLog, branchList, branches, totals } =
      reportData;

    const workbook = new ExcelJS.Workbook();

    // ==========================================
    // 2. ВКЛАДКА 1: ОСНОВНОЙ ОТЧЕТ
    // ==========================================
    const worksheet = workbook.addWorksheet('Асосий хисобот (Отчет)');

    const dateRangeStr = `с ${format(start, 'dd.MM.yyyy')} по ${format(end, 'dd.MM.yyyy')}`;
    const titleText = `ОРЗУ МЕДИКАЛ клиникаларининг ${dateRangeStr} ётган беморларнинг кайта алокага олинганлар буйича курсаткичлари тугрисида`;

    worksheet.mergeCells(1, 1, 1, 78);
    const titleRow = worksheet.getCell('A1');
    titleRow.value = titleText.toUpperCase();
    titleRow.font = { name: 'Times New Roman', size: 12, bold: true };
    titleRow.alignment = {
      vertical: 'middle',
      horizontal: 'center',
      wrapText: true,
    };
    worksheet.getRow(1).height = 40;

    worksheet.mergeCells(2, 1, 2, 78);
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
    const C_TEAL = 'FFB4A7D6';
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
      17,
      'корректно',
      [
        'обзвон',
        '%',
        'дубликаты',
        'не ответили',
        'номер отключен',
        'Всего',
        '%',
      ],
      C_GREEN,
      true,
    );

    const catConfigs = [
      { name: 'ВРАЧИ', color: C_BLUE },
      { name: 'МЕДСЕСТРЫ', color: C_YELLOW },
      { name: 'ЧИСТОТА', color: C_ORANGE },
      { name: 'КУХНЯ', color: C_CYAN },
      { name: 'РЕГИСТРАТУРА', color: C_PURPLE },
      { name: 'КЛИНИКА', color: C_TEAL },
      { name: 'ВСЕГО', color: C_GOLD },
    ];

    let colIdx = 18;
    REPORT_RATING_CATEGORIES.forEach((cat, index) => {
      const subLabels = REPORT_SCORE_VALUES.map((s) => [
        `${cat.scorePrefix} ${s}`,
        '%',
      ]).flat();
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

    const totalSubLabels = REPORT_SCORE_VALUES.map((s) => [
      `${REPORT_TOTAL_RATING_CATEGORY.scorePrefix} ${s}`,
      '%',
    ]).flat();
    setupHeader(
      colIdx,
      colIdx + 7,
      catConfigs[6].name,
      totalSubLabels,
      catConfigs[6].color,
      true,
    );

    setupHeader(
      74,
      78,
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

    branches.forEach((branchStats, index) => {
      const rowValues = Array(79).fill(null);
      rowValues[1] = index + 1;
      rowValues[2] = branchStats.branch;
      rowValues[3] = null;
      rowValues[4] = branchStats.handedOver.count;
      rowValues[5] = null;

      rowValues[6] = branchStats.incorrect.wrongNumber.count;
      rowValues[7] = branchStats.incorrect.employeeNumber.count;
      rowValues[8] = branchStats.incorrect.hasNotWhatsapp.count;
      rowValues[9] = branchStats.incorrect.total.count;
      rowValues[10] = branchStats.incorrect.total.ratio || 0;

      rowValues[11] = branchStats.correct.called.count;
      rowValues[12] = branchStats.correct.called.ratio || 0;
      rowValues[13] = branchStats.correct.duplicates.count;
      rowValues[14] = branchStats.correct.noAnswer.count;
      rowValues[15] = branchStats.correct.unreachable.count;
      rowValues[16] = branchStats.correct.total.count;
      rowValues[17] = branchStats.correct.total.ratio || 0;

      let cIdx = 18;
      REPORT_RATING_CATEGORIES.forEach((cat) => {
        REPORT_SCORE_VALUES.forEach((s) => {
          const value = branchStats.ratings[cat.id][s];
          rowValues[cIdx++] = value.count;
          rowValues[cIdx++] = value.ratio || 0;
        });
      });
      REPORT_SCORE_VALUES.forEach((s) => {
        const value = branchStats.ratings.total[s];
        rowValues[cIdx++] = value.count;
        rowValues[cIdx++] = value.ratio || 0;
      });

      rowValues[74] = branchStats.feedback.complaints.count;
      rowValues[75] = branchStats.feedback.complaints.ratio || 0;
      rowValues[76] = branchStats.feedback.suggestions.count;
      rowValues[77] = branchStats.feedback.notRelatedComplaints.count;
      rowValues[78] = 'Вкладка "Ссылки"';

      const row = worksheet.addRow(rowValues.slice(1));

      [10, 12, 17, 75].forEach((c) => {
        row.getCell(c).numFmt = '0.0%';
      });
      for (let i = 19; i <= 73; i += 2) {
        row.getCell(i).numFmt = '0.0%';
      }

      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        cell.border = borderStyle;
        cell.alignment = alignCenter;
        if (colNumber === 78) {
          cell.font = {
            color: { argb: '0000FF' },
            underline: true,
            italic: true,
          };
        }
        if (cell.value === 0 || cell.value === '0 (0.0%)') cell.value = '';
      });
    });

    // ИТОГО
    const totalRowValues = Array(79).fill(null);
    totalRowValues[1] = 'ИТОГО';
    totalRowValues[4] = totals.handedOver.count;

    totalRowValues[6] = totals.incorrect.wrongNumber.count;
    totalRowValues[7] = totals.incorrect.employeeNumber.count;
    totalRowValues[8] = totals.incorrect.hasNotWhatsapp.count;
    totalRowValues[9] = totals.incorrect.total.count;
    totalRowValues[10] = totals.incorrect.total.ratio || 0;

    totalRowValues[11] = totals.correct.called.count;
    totalRowValues[12] = totals.correct.called.ratio || 0;
    totalRowValues[13] = totals.correct.duplicates.count;
    totalRowValues[14] = totals.correct.noAnswer.count;
    totalRowValues[15] = totals.correct.unreachable.count;
    totalRowValues[16] = totals.correct.total.count;
    totalRowValues[17] = totals.correct.total.ratio || 0;

    let totalCIdx = 18;
    REPORT_RATING_CATEGORIES.forEach((cat) => {
      REPORT_SCORE_VALUES.forEach((s) => {
        const value = totals.ratings[cat.id][s];
        totalRowValues[totalCIdx++] = value.count;
        totalRowValues[totalCIdx++] = value.ratio || 0;
      });
    });

    REPORT_SCORE_VALUES.forEach((s) => {
      const value = totals.ratings.total[s];
      totalRowValues[totalCIdx++] = value.count;
      totalRowValues[totalCIdx++] = value.ratio || 0;
    });

    totalRowValues[74] = totals.feedback.complaints.count;
    totalRowValues[75] = totals.feedback.complaints.ratio || 0;
    totalRowValues[76] = totals.feedback.suggestions.count;
    totalRowValues[77] = totals.feedback.notRelatedComplaints.count;

    const totalRow = worksheet.addRow(totalRowValues.slice(1));
    worksheet.mergeCells(`A${totalRow.number}:C${totalRow.number}`);
    totalRow.font = { bold: true };

    totalRow.eachCell({ includeEmpty: true }, (cell) => {
      cell.fill = fillStyle(C_GRAY);
      cell.border = borderStyle;
      cell.alignment = alignCenter;
      if (cell.value === 0 || cell.value === '0 (0.0%)') cell.value = '';
    });

    [10, 12, 17, 75].forEach((c) => {
      totalRow.getCell(c).numFmt = '0.0%';
    });
    for (let i = 19; i <= 73; i += 2) {
      totalRow.getCell(i).numFmt = '0.0%';
    }

    worksheet.columns.forEach((col) => {
      if (col.number === 2) col.width = 20;
      else if (col.number === 78) col.width = 18;
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

    errorSheet.addRow([
      'ХАТОЛИКЛАР СТАТИСТИКАСИ ФИЛИАЛЛАР БЎЙИЧА (Статистика по филиалам)',
    ]);
    errorSheet.mergeCells(
      // @ts-ignore
      `A${errorSheet.lastRow.number}:C${errorSheet.lastRow.number}`,
    );
    // @ts-ignore
    errorSheet.lastRow.font = { bold: true, size: 12 };
    // @ts-ignore
    errorSheet.lastRow.alignment = { horizontal: 'center' };

    errorSheet.addRow(['Филиал', 'Сони (Кол-во)', 'Улуши (%)']);
    // @ts-ignore
    errorSheet.lastRow.font = { bold: true };
    // @ts-ignore
    errorSheet.lastRow.eachCell((c) => {
      c.fill = fillStyle(C_GRAY);
      c.border = borderStyle;
    });

    branchList.forEach((branch) => {
      const branchErrorCount = errorsLog.filter(
        (e) => e.branch === branch,
      ).length;
      if (branchErrorCount > 0) {
        const row = errorSheet.addRow([
          branch,
          branchErrorCount,
          totalErrors ? branchErrorCount / totalErrors : 0,
        ]);
        row.getCell(3).numFmt = '0.0%';
        row.eachCell((c) => (c.border = borderStyle));
      }
    });

    errorSheet.addRow([]);

    errorSheet.addRow([
      'ХАТОЛИКЛАР ТАФСИЛОТИ (Детализация ошибок по филиалам)',
    ]);
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

    let errorIndex = 1;
    branchList.forEach((branch) => {
      const branchErrors = errorsLog.filter((e) => e.branch === branch);
      if (branchErrors.length === 0) return;

      const titleRow = errorSheet.addRow([`ФИЛИАЛ: ${branch.toUpperCase()}`]);
      titleRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      titleRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF1F4E78' },
      };
      // @ts-ignore
      errorSheet.mergeCells(`A${titleRow.number}:H${titleRow.number}`);
      titleRow.alignment = { horizontal: 'center' };

      branchErrors.forEach((e) => {
        const mappedCategory =
          ERROR_CATEGORIES_MAPPING[
            e.category as keyof typeof ERROR_CATEGORIES_MAPPING
          ] || e.category;
        const row = errorSheet.addRow([
          errorIndex++,
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
