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
  { id: 'doctors', label: 'Врачлар тугрисида' },
  { id: 'nurses', label: 'Хамширалар тугрисида' },
  { id: 'cleanliness', label: 'Тозалик тугрисида' },
  { id: 'food', label: 'Ошхона ва ошпазлар' },
  { id: 'reception', label: 'Регистратура' },
  { id: 'clinic', label: 'Жами клиника' },
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
    const end = new Date(dto.endDate);
    end.setHours(23, 59, 59, 999);

    // ==========================================
    // 1. ВЫБОРКА ОСНОВНЫХ ДАННЫХ И СОЗДАНИЕ КНИГИ
    // ==========================================
    const requests = await this.requestRepository.find({
      where: {
        arrivalDate: Between(start, end),
        status: Not(In([RequestStatus.NEW, RequestStatus.CONTACTED])),
      },
      relations: ['patient', 'feedback', 'feedback.evidenceMessages'],
    });

    const workbook = new ExcelJS.Workbook();
    
    // --- ВКЛАДКА 1: ОСНОВНОЙ ОТЧЕТ ---
    const worksheet = workbook.addWorksheet('Асосий хисобот (Отчет)');

    const dateRangeStr = `с ${format(start, 'dd.MM.yyyy')} по ${format(end, 'dd.MM.yyyy')}`;
    const titleText = `ОРЗУ МЕДИКАЛ клиникаларининг ${dateRangeStr} ётган беморларнинг кайта алокага олинганлар буйича курсаткичлари тугрисида`;

    worksheet.mergeCells('A1:BL1');
    const titleRow = worksheet.getCell('A1');
    titleRow.value = titleText.toUpperCase();
    titleRow.font = { name: 'Times New Roman', size: 12, bold: true };
    titleRow.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    worksheet.getRow(1).height = 40;

    worksheet.mergeCells('A2:BL2');
    const subTitleRow = worksheet.getCell('A2');
    subTitleRow.value = 'М А Ъ Л У М О Т Н О М А';
    subTitleRow.font = { name: 'Times New Roman', size: 14, bold: true };
    subTitleRow.alignment = { vertical: 'middle', horizontal: 'center' };

    worksheet.addRow([]);

    const baseHeadersRow1 = [
      'Т/Р', 'Клиникалар', 'Келган Беморлар (жами)', 'Кайта алокага олинганлар (Дозвон)', '%',
      'телефон кутармади', 'нотугри номер', 'учирилган номер', 'WhatsApp йук', 'Алокага чикилмаган (жами)', '%',
      'Шикоятлар', 'Таклифлар', 'Клиникага тегишли эмас'
    ];

    const ratingHeadersCount: string[] = [];
    const ratingHeadersPct: string[] = [];
    CATEGORIES.forEach((cat) => {
      SCORES.forEach((s) => {
        ratingHeadersCount.push(`${cat.label} (${s})`);
        ratingHeadersPct.push(`${cat.label} (${s} %)`);
      });
    });

    const linkHeaders = ['Шикоят файллари / Trello', 'Таклиф файллари / Trello'];
    const fullHeaders = [...baseHeadersRow1, ...ratingHeadersCount, ...ratingHeadersPct, ...linkHeaders];

    const headerRow = worksheet.addRow(fullHeaders);
    headerRow.font = { bold: true };
    headerRow.eachCell((cell) => {
      cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true, textRotation: 90 };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'D9D9D9' } };
    });
    for(let i=1; i<=14; i++) {
        headerRow.getCell(i).alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    }
    worksheet.getRow(4).height = 120;

    const branchList = [...new Set(requests.map((r) => r.branch).filter(Boolean))];
    const totals = {
      processed: 0, success: 0, noAnswer: 0, unreachable: 0, wrongNum: 0, noWa: 0,
      feedNeg: 0, feedPos: 0, feedNotRel: 0,
      ratingsCount: {} as Record<string, number>,
    };

    branchList.forEach((branch, index) => {
      const bRequests = requests.filter((r) => r.branch === branch);
      const bTotal = bRequests.length;

      const bNoAnswer = bRequests.filter((r) => r.status === RequestStatus.NO_ANSWER).length;
      const bUnreachable = bRequests.filter((r) => r.status === RequestStatus.UNREACHABLE).length;
      const bWrongNum = bRequests.filter((r) => r.status === RequestStatus.WRONG_NUMBER).length;
      const bNoWa = bRequests.filter((r) => r.status === RequestStatus.HAS_NOT_WHATSAPP).length;
      const bFailTotal = bNoAnswer + bUnreachable + bWrongNum + bNoWa;
      const bSuccess = bTotal - bFailTotal;

      const bFeedNeg = bRequests.filter((r) => r.status === RequestStatus.FEEDBACK_NEGATIVE).length;
      const bFeedPos = bRequests.filter((r) => r.status === RequestStatus.FEEDBACK_POSITIVE).length;
      const bFeedNotRel = bRequests.filter((r) => r.status === RequestStatus.FEEDBACK_NOT_RELATED).length;

      const branchRatings: Record<string, number> = {};
      const linksNeg: {text: string, url: string}[] = [];
      const linksOther: {text: string, url: string}[] = [];

      const successRequests = bRequests.filter((r) => 
        [RequestStatus.ALL_OK, RequestStatus.FEEDBACK_POSITIVE, RequestStatus.FEEDBACK_NEGATIVE, RequestStatus.FEEDBACK_NOT_RELATED].includes(r.status)
      );

      successRequests.forEach((req) => {
        // Оценки
        CATEGORIES.forEach((cat) => {
          let score = 5;
          if (req.status === RequestStatus.FEEDBACK_NEGATIVE) {
             score = req.feedback?.ratings?.[cat.id] || 5;
          }
          if (!SCORES.includes(score)) score = 5;
          const key = `${cat.id}-${score}`;
          branchRatings[key] = (branchRatings[key] || 0) + 1;
          totals.ratingsCount[key] = (totals.ratingsCount[key] || 0) + 1;
        });

        // 🔥 ДОБАВЛЕНИЕ TRELLO И ФАЙЛОВ В ОТЧЕТ 🔥
        if (req.status === RequestStatus.FEEDBACK_NEGATIVE) {
            if (req.feedback?.trelloUrl) {
                linksNeg.push({ text: 'Trello (Шикоят)', url: req.feedback.trelloUrl });
            }
            if (req.feedback?.evidenceMessages?.length > 0) {
                req.feedback.evidenceMessages.forEach((e, i) => {
                    if (e.mediaUrl) linksNeg.push({ text: `Файл-${i + 1}`, url: e.mediaUrl });
                });
            }
        } else if ([RequestStatus.FEEDBACK_POSITIVE, RequestStatus.FEEDBACK_NOT_RELATED].includes(req.status)) {
            if (req.feedback?.trelloUrl) {
                linksOther.push({ text: 'Trello (Таклиф)', url: req.feedback.trelloUrl });
            }
            if (req.feedback?.evidenceMessages?.length > 0) {
                req.feedback.evidenceMessages.forEach((e, i) => {
                    if (e.mediaUrl) linksOther.push({ text: `Файл-${i + 1}`, url: e.mediaUrl });
                });
            }
        }
      });

      const maxRows = Math.max(linksNeg.length, linksOther.length, 1);
      // @ts-ignore
      const startRowNumber = worksheet.lastRow.number + 1;

      for (let i = 0; i < maxRows; i++) {
        const rowValues = Array(fullHeaders.length + 1).fill(null);
        
        if (i === 0) {
          rowValues[1] = index + 1; rowValues[2] = branch; rowValues[3] = bTotal;
          rowValues[4] = bSuccess; rowValues[5] = bTotal ? bSuccess / bTotal : 0;
          rowValues[6] = bNoAnswer; rowValues[7] = bWrongNum; rowValues[8] = bUnreachable; rowValues[9] = bNoWa;
          rowValues[10] = bFailTotal; rowValues[11] = bTotal ? bFailTotal / bTotal : 0;
          rowValues[12] = bFeedNeg; rowValues[13] = bFeedPos; rowValues[14] = bFeedNotRel;

          let colIndex = 15;
          CATEGORIES.forEach(cat => SCORES.forEach(s => { rowValues[colIndex++] = branchRatings[`${cat.id}-${s}`] || 0; }));
          CATEGORIES.forEach(cat => SCORES.forEach(s => {
              const count = branchRatings[`${cat.id}-${s}`] || 0;
              rowValues[colIndex++] = bSuccess > 0 ? count / bSuccess : 0;
          }));
        }

        const linkColStart = 15 + 48; // Индекс начала колонок со ссылками
        if (linksNeg[i]) rowValues[linkColStart] = { text: linksNeg[i].text, hyperlink: linksNeg[i].url };
        if (linksOther[i]) rowValues[linkColStart + 1] = { text: linksOther[i].text, hyperlink: linksOther[i].url };

        const row = worksheet.addRow(rowValues.slice(1));
        
        if (i === 0) {
            row.getCell(5).numFmt = '0.0%'; row.getCell(11).numFmt = '0.0%';
            for(let c = 15 + 24; c < 15 + 48; c++) row.getCell(c).numFmt = '0.0%';
        }

        row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
          cell.border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
          if (colNumber >= linkColStart - 1 && cell.value) cell.font = { color: { argb: '0000FF' }, underline: true };
          if (cell.value === 0 || cell.value === '0 (0.0%)') cell.value = '';
        });
      }

      if (maxRows > 1) {
        for (let col = 1; col <= fullHeaders.length - 2; col++) {
          worksheet.mergeCells(startRowNumber, col, startRowNumber + maxRows - 1, col);
        }
      }

      totals.processed += bTotal; totals.success += bSuccess;
      totals.noAnswer += bNoAnswer; totals.unreachable += bUnreachable;
      totals.wrongNum += bWrongNum; totals.noWa += bNoWa;
      totals.feedNeg += bFeedNeg; totals.feedPos += bFeedPos; totals.feedNotRel += bFeedNotRel;
    });

    // --- ИТОГИ ОСНОВНОГО ОТЧЕТА ---
    const gPctContacted = totals.processed > 0 ? totals.success / totals.processed : 0;
    const gFailTotal = totals.noAnswer + totals.wrongNum + totals.unreachable + totals.noWa;
    const gPctNotContacted = totals.processed > 0 ? gFailTotal / totals.processed : 0;

    const totalRowValues = [
        'ИТОГО', '', totals.processed, totals.success, gPctContacted,
        totals.noAnswer, totals.wrongNum, totals.unreachable, totals.noWa, gFailTotal, gPctNotContacted,
        totals.feedNeg, totals.feedPos, totals.feedNotRel
    ];

    CATEGORIES.forEach(cat => SCORES.forEach(s => { totalRowValues.push(totals.ratingsCount[`${cat.id}-${s}`] || 0); }));
    CATEGORIES.forEach(cat => SCORES.forEach(s => {
        const count = totals.ratingsCount[`${cat.id}-${s}`] || 0;
        totalRowValues.push(totals.success > 0 ? count / totals.success : 0);
    }));

    const totalRow = worksheet.addRow(totalRowValues);
    worksheet.mergeCells(`A${totalRow.number}:B${totalRow.number}`);
    
    totalRow.getCell(5).numFmt = '0.0%'; totalRow.getCell(11).numFmt = '0.0%';
    for(let c = 15 + 24; c < 15 + 48; c++) totalRow.getCell(c).numFmt = '0.0%';

    totalRow.font = { bold: true };
    totalRow.eachCell((cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'BFBFBF' } };
        cell.border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        if (cell.value === 0 || cell.value === '0 (0.0%)') cell.value = '';
    });

    worksheet.columns.forEach((col, i) => { 
        if (i === 1) col.width = 20; 
        else if (i >= fullHeaders.length - 2) col.width = 25; 
        else col.width = 8; 
    });


    // ==========================================
    // 2. ВКЛАДКА 2: ОБЗОР И ДЕТАЛИЗАЦИЯ ОШИБОК ИМПОРТА
    // ==========================================
    const errorSheet = workbook.addWorksheet('Импорт хатоликлари (Ошибки)');
    
    // 🔥 ИСПРАВЛЕНИЕ: Ищем по arrivalDate, а не по createdAt! 🔥
    const errorsLog = await this.errorLogRepository.find({
      where: { arrivalDate: Between(start, end) }, 
      order: { createdAt: 'DESC' }
    });

    const totalErrors = errorsLog.length;

    errorSheet.addRow(['ИМПОРТ ҚИЛИШДАГИ ХАТОЛИКЛАР СТАТИСТИКАСИ (Статистика ошибок)']);
    errorSheet.mergeCells('A1:C1');
    errorSheet.getCell('A1').font = { bold: true, size: 12 };
    errorSheet.getCell('A1').alignment = { horizontal: 'center' };

    errorSheet.addRow(['Хатолик тури (Категория)', 'Сони (Кол-во)', 'Улуши (%)']);
    // @ts-ignore
    errorSheet.lastRow.font = { bold: true };
    // @ts-ignore
    errorSheet.lastRow.eachCell(c => {
       c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'D9D9D9' } };
       c.border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };
    });

    const categoryCounts: Record<string, number> = {};
    errorsLog.forEach(e => {
       categoryCounts[e.category] = (categoryCounts[e.category] || 0) + 1;
    });

    Object.keys(ERROR_CATEGORIES_MAPPING).forEach(cat => {
       const count = categoryCounts[cat] || 0;
       const pct = totalErrors > 0 ? (count / totalErrors) : 0;
       
       const row = errorSheet.addRow([ERROR_CATEGORIES_MAPPING[cat], count, pct]);
       row.getCell(3).numFmt = '0.0%';
       row.eachCell(c => c.border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} });
    });

    const errTotalRow = errorSheet.addRow(['ЖАМИ (ИТОГО)', totalErrors, 1]);
    errTotalRow.font = { bold: true };
    errTotalRow.getCell(3).numFmt = '0.0%';
    errTotalRow.eachCell(c => c.border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} });

    errorSheet.addRow([]); // Отступ

    errorSheet.addRow(['ХАТОЛИКЛАР ТАФСИЛОТИ (Детализация ошибок)']);
    // @ts-ignore
    errorSheet.mergeCells(`A${errorSheet.lastRow.number}:H${errorSheet.lastRow.number}`);
    // @ts-ignore
    errorSheet.lastRow.font = { bold: true, size: 12 };
    // @ts-ignore
    errorSheet.lastRow.alignment = { horizontal: 'center' };

    const detailHeaders = ['№', 'Келган сана (arrivalDate)', 'Юкланган сана (Импорт)', 'Қатор (Excel)', 'Ф.И.Ш (Имя)', 'Телефон', 'Филиал', 'Изох (Ошибка)'];
    const detRow = errorSheet.addRow(detailHeaders);
    detRow.font = { bold: true };
    detRow.eachCell(c => {
       c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'D9D9D9' } };
       c.border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };
       c.alignment = { horizontal: 'center', vertical: 'middle' };
    });

    errorsLog.forEach((e, i) => {
       const mappedCategory = ERROR_CATEGORIES_MAPPING[e.category] || e.category;
       const errorText = `[${mappedCategory}] - ${e.errorMessages.join('; ')}`;

       const row = errorSheet.addRow([
          i + 1,
          format(e.arrivalDate, 'dd.MM.yyyy'),
          format(e.createdAt, 'dd.MM.yyyy HH:mm'),
          e.lineNumber,
          e.name || '-',
          e.phone || '-',
          e.branch || '-',
          errorText
       ]);
       
       row.eachCell(c => c.border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} });
    });

    errorSheet.columns.forEach((c, i) => {
       if (i === 0) c.width = 6;
       else if (i === 1 || i === 2) c.width = 20; 
       else if (i === 4) c.width = 30; // Имя
       else if (i === 5) c.width = 20; // Телефон
       else if (i === 6) c.width = 25; // Филиал
       else if (i === 7) c.width = 70; // Текст ошибки
       else c.width = 15;
    });

    // ==========================================
    // 3. СОХРАНЕНИЕ ФАЙЛА
    // ==========================================
    const uint8Array = await workbook.xlsx.writeBuffer();
    const buffer = Buffer.from(uint8Array);
    
    const fileName = `Отчет_${format(start, 'dd.MM.yyyy')}-${format(end, 'dd.MM.yyyy')}_${Date.now()}.xlsx`;
    const uploadDir = path.join(process.cwd(), 'uploads', 'reports');
    await fs.mkdir(uploadDir, { recursive: true });
    
    const filePath = path.join(uploadDir, fileName);
    await fs.writeFile(filePath, buffer);
    
    const backendUrl = process.env.UPLOAD_URL || process.env.BACKEND_URL || 'http://localhost:3000';
    const fileUrl = `${backendUrl}/uploads/reports/${fileName}`;

    const report = this.reportRepository.create({
      name: fileName,
      fileUrl: fileUrl,
      startDate: start,
      endDate: end,
      status: 'ready', 
    });

    return this.reportRepository.save(report);
  }

  async remove(id: string) {
    const report = await this.reportRepository.findOne({ where: { id }});
    if (report) {
       try {
           const fileName = report.fileUrl.split('/').pop();
           if (fileName) {
               const filePath = path.join(process.cwd(), 'uploads', 'reports', fileName);
               await fs.unlink(filePath);
           }
       } catch (e) {
           this.logger.warn(`Could not delete file for report ${id}: ${e.message}`);
       }
       return this.reportRepository.delete(id);
    }
  }
}