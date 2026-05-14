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

const CATEGORIES = [
  { id: 'doctors', label: 'Врачлар тугрисида' },
  { id: 'nurses', label: 'Хамширалар тугрисида' },
  { id: 'cleanliness', label: 'Тозалик тугрисида' },
  { id: 'food', label: 'Ошхона ва ошпазлар' },
  { id: 'reception', label: 'Регистратура' },
  { id: 'clinic', label: 'Жами клиника' },
];

const SCORES = [5, 4, 3, 2];

@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);

  constructor(
    @InjectRepository(Report)
    private reportRepository: Repository<Report>,
    @InjectRepository(PatientRequest)
    private requestRepository: Repository<PatientRequest>,
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

    // --- ЛОГИКА ВЫБОРКИ ---
    // Фильтруем по arrivalDate, исключаем NEW и CONTACTED
    const requests = await this.requestRepository.find({
      where: {
        arrivalDate: Between(start, end),
        status: Not(In([RequestStatus.NEW, RequestStatus.CONTACTED])),
      },
      relations: ['patient', 'feedback', 'feedback.evidenceMessages'],
    });

    // --- СТРУКТУРА EXCEL ИЗ ВАШЕГО КОДА ---
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Отчет');

    const dateRangeStr = `с ${format(start, 'dd.MM.yyyy')} по ${format(end, 'dd.MM.yyyy')}`;
    const titleText = `ПОКАЗАТЕЛИ ОБРАТНОЙ СВЯЗИ ПО ДАТЕ ЗАЕЗДА ЗА ПЕРИОД ${dateRangeStr}`;

    // Всего колонок: 14 базовых + 24 (счетчик) + 24 (проценты) + 2 (ссылки) = 64 колонки (A - BL)
    worksheet.mergeCells('A1:BL1');
    const titleRow = worksheet.getCell('A1');
    titleRow.value = titleText.toUpperCase();
    titleRow.font = { name: 'Times New Roman', size: 12, bold: true };
    titleRow.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    worksheet.getRow(1).height = 40;

    worksheet.mergeCells('A2:BL2');
    const subTitleRow = worksheet.getCell('A2');
    subTitleRow.value = 'С П Р А В К А';
    subTitleRow.font = { name: 'Times New Roman', size: 14, bold: true };
    subTitleRow.alignment = { vertical: 'middle', horizontal: 'center' };
    worksheet.getRow(2).height = 25;

    worksheet.addRow([]); // Пустая строка

    // Сборка заголовков
    const baseHeaders = [
      '№', 'Филиал', 'Всего пациентов', 'Дозвонились', '% Дозвона',
      'Нет ответа', 'Неверный номер', 'Нет связи', 'Нет WhatsApp', 'Всего не дозвонились', '% Недозвона',
      'Жалобы', 'Предложения', 'Не относится к клинике'
    ];

    const countHeaders: string[] = [];
    const pctHeaders: string[] = [];
    CATEGORIES.forEach(cat => {
      SCORES.forEach(s => {
        countHeaders.push(`${cat.label} (${s})`);
        pctHeaders.push(`${cat.label} (${s} %)`);
      });
    });

    const linkHeaders = ['Ссылка (Жалоба)', 'Ссылка (Предложение)'];
    const fullHeaders = [...baseHeaders, ...countHeaders, ...pctHeaders, ...linkHeaders];

    const headerRow = worksheet.addRow(fullHeaders);
    headerRow.font = { bold: true };
    headerRow.eachCell((cell) => {
      cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'D9D9D9' } };
    });
    worksheet.getRow(4).height = 80;

    // Глобальные счетчики
    const globalStats = {
      totalPatients: 0, contactedCount: 0, noAnswer: 0, wrongNumber: 0, noConnection: 0, noWhatsApp: 0,
      notContactedTotal: 0, complaints: 0, suggestions: 0, notRelated: 0,
      points: {} as Record<string, number>,
    };

    const branchList = [...new Set(requests.map((r) => r.branch).filter(Boolean))];

    branchList.forEach((branch, index) => {
      const branchPatients = requests.filter((p) => p.branch === branch);
      const totalPatients = branchPatients.length;

      let bNoAnswer = 0, bWrongNumber = 0, bNoConnection = 0, bNoWhatsApp = 0;
      let bComplaints = 0, bSuggestions = 0, bNotRelated = 0;
      
      const branchRatings: Record<string, number> = {};
      const complaintLinks: string[] = [];
      const suggestionLinks: string[] = [];

      branchPatients.forEach((p) => {
        // Подсчет недозвонов
        if (p.status === RequestStatus.NO_ANSWER) bNoAnswer++;
        else if (p.status === RequestStatus.WRONG_NUMBER) bWrongNumber++;
        else if (p.status === RequestStatus.UNREACHABLE) bNoConnection++;
        else if (p.status === RequestStatus.HAS_NOT_WHATSAPP) bNoWhatsApp++;
        
        // Подсчет типов фидбека
        else if (p.status === RequestStatus.FEEDBACK_NEGATIVE) bComplaints++;
        else if (p.status === RequestStatus.FEEDBACK_POSITIVE) bSuggestions++;
        else if (p.status === RequestStatus.FEEDBACK_NOT_RELATED) bNotRelated++;

        // Если это успешный дозвон (ALL_OK, POSITIVE, NEGATIVE, NOT_RELATED)
        if ([RequestStatus.ALL_OK, RequestStatus.FEEDBACK_POSITIVE, RequestStatus.FEEDBACK_NEGATIVE, RequestStatus.FEEDBACK_NOT_RELATED].includes(p.status)) {
            
            // --- ЛОГИКА ОЦЕНОК ---
            CATEGORIES.forEach((cat) => {
                let score = 5; // По умолчанию 5 (для ALL_OK, POSITIVE, NOT_RELATED)
                
                // Только для жалоб читаем реальные баллы
                if (p.status === RequestStatus.FEEDBACK_NEGATIVE) {
                    score = p.feedback?.ratings?.[cat.id] || 5;
                }
                
                if (!SCORES.includes(score)) score = 5; // защита от неверных данных

                const key = `${cat.id}-${score}`;
                branchRatings[key] = (branchRatings[key] || 0) + 1;
                globalStats.points[key] = (globalStats.points[key] || 0) + 1;
            });

            // Сбор ссылок на медиа-файлы
            if (p.feedback?.evidenceMessages?.length > 0) {
                const urls = p.feedback.evidenceMessages.map(e => e.mediaUrl).filter(Boolean);
                if (p.status === RequestStatus.FEEDBACK_NEGATIVE) complaintLinks.push(...urls);
                else suggestionLinks.push(...urls);
            }
        }
      });

      const notContactedTotal = bNoAnswer + bWrongNumber + bNoConnection + bNoWhatsApp;
      const bContacted = totalPatients - notContactedTotal;

      const maxRows = Math.max(complaintLinks.length, suggestionLinks.length, 1);
      // @ts-ignore
      const startRowNumber = worksheet.lastRow.number + 1;

      for (let i = 0; i < maxRows; i++) {
        const rowValues = Array(fullHeaders.length + 1).fill(null);
        
        if (i === 0) {
          rowValues[1] = index + 1; rowValues[2] = branch; rowValues[3] = totalPatients;
          rowValues[4] = bContacted; rowValues[5] = totalPatients > 0 ? bContacted / totalPatients : 0;
          rowValues[6] = bNoAnswer; rowValues[7] = bWrongNumber; rowValues[8] = bNoConnection; rowValues[9] = bNoWhatsApp;
          rowValues[10] = notContactedTotal; rowValues[11] = totalPatients > 0 ? notContactedTotal / totalPatients : 0;
          rowValues[12] = bComplaints; rowValues[13] = bSuggestions; rowValues[14] = bNotRelated;

          let colIndex = 15;
          // Количественные баллы
          CATEGORIES.forEach(cat => SCORES.forEach(s => {
              rowValues[colIndex++] = branchRatings[`${cat.id}-${s}`] || 0;
          }));
          // Проценты по баллам
          CATEGORIES.forEach(cat => SCORES.forEach(s => {
              const count = branchRatings[`${cat.id}-${s}`] || 0;
              rowValues[colIndex++] = bContacted > 0 ? count / bContacted : 0;
          }));
        }

        const linkColStart = 15 + 48; // 14 базовых + 48 колонок баллов
        if (complaintLinks[i]) rowValues[linkColStart] = { text: `Жалоба-${i+1}`, hyperlink: complaintLinks[i] };
        if (suggestionLinks[i]) rowValues[linkColStart + 1] = { text: `Предложение-${i+1}`, hyperlink: suggestionLinks[i] };

        const row = worksheet.addRow(rowValues.slice(1));
        
        // --- ПРИМЕНЯЕМ СТРУКТУРУ EXCEL ИЗ ВАШЕГО КОДА ---
        if (i === 0) {
            row.getCell(5).numFmt = '0.0%';
            row.getCell(11).numFmt = '0.0%';
            for(let c = 15 + 24; c < 15 + 48; c++) {
               row.getCell(c).numFmt = '0.0%';
            }
        }

        row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
          cell.border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
          
          if (colNumber >= linkColStart - 1 && cell.value) cell.font = { color: { argb: '0000FF' }, underline: true };
          // Очистка пустых значений (как в вашем коде)
          if (cell.value === 0 || cell.value === '0 (0.0%)') cell.value = '';
        });
      }

      if (maxRows > 1) {
        for (let col = 1; col <= fullHeaders.length - 2; col++) {
          worksheet.mergeCells(startRowNumber, col, startRowNumber + maxRows - 1, col);
        }
      }

      globalStats.totalPatients += totalPatients; globalStats.contactedCount += bContacted;
      globalStats.noAnswer += bNoAnswer; globalStats.wrongNumber += bWrongNumber;
      globalStats.noConnection += bNoConnection; globalStats.noWhatsApp += bNoWhatsApp;
      globalStats.notContactedTotal += notContactedTotal;
      globalStats.complaints += bComplaints; globalStats.suggestions += bSuggestions;
      globalStats.notRelated += bNotRelated;
    });

    // --- ИТОГО ---
    const gPctContacted = globalStats.totalPatients > 0 ? globalStats.contactedCount / globalStats.totalPatients : 0;
    const gPctNotContacted = globalStats.totalPatients > 0 ? globalStats.notContactedTotal / globalStats.totalPatients : 0;

    const totalRowValues = [
        'ИТОГО', '', globalStats.totalPatients, globalStats.contactedCount, gPctContacted,
        globalStats.noAnswer, globalStats.wrongNumber, globalStats.noConnection, globalStats.noWhatsApp, globalStats.notContactedTotal, gPctNotContacted,
        globalStats.complaints, globalStats.suggestions, globalStats.notRelated
    ];

    // Итого количества
    CATEGORIES.forEach(cat => SCORES.forEach(s => {
        totalRowValues.push(globalStats.points[`${cat.id}-${s}`] || 0);
    }));
    // Итого проценты
    CATEGORIES.forEach(cat => SCORES.forEach(s => {
        const count = globalStats.points[`${cat.id}-${s}`] || 0;
        totalRowValues.push(globalStats.contactedCount > 0 ? count / globalStats.contactedCount : 0);
    }));

    const totalRow = worksheet.addRow(totalRowValues);
    worksheet.mergeCells(`A${totalRow.number}:B${totalRow.number}`);
    
    totalRow.getCell(5).numFmt = '0.0%'; totalRow.getCell(11).numFmt = '0.0%';
    for(let c = 15 + 24; c < 15 + 48; c++) totalRow.getCell(c).numFmt = '0.0%';

    totalRow.font = { bold: true };
    totalRow.eachCell((cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'BFBFBF' } }; // Цвет как в вашем коде
        cell.border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        if (cell.value === 0 || cell.value === '0 (0.0%)') cell.value = '';
    });

    // Ширина колонок (как в вашем коде)
    worksheet.columns.forEach((col, i) => { 
        if (i === 1) col.width = 20; 
        else if (i >= fullHeaders.length - 2) col.width = 25; 
        else col.width = 8; 
    });

    // --- РУЧНОЕ СОХРАНЕНИЕ ---
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