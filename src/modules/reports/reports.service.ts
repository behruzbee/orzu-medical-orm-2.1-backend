import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, In } from 'typeorm'; // Не забудьте импортировать In
import * as ExcelJS from 'exceljs';
import { format } from 'date-fns';

import { Report } from './entities/report.entity';
import { Patient } from '../patients/entities/patient.entity';
import { GenerateReportDto } from './dto/generate-report.dto';
import { FilesService } from '../files/files.service';
import { PatientStatus } from 'src/common/enums/patient-status.enum';

@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);

  constructor(
    @InjectRepository(Report)
    private reportRepository: Repository<Report>,
    @InjectRepository(Patient)
    private patientRepository: Repository<Patient>,
    private filesService: FilesService,
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

    // 1. ФИЛЬТРАЦИЯ: Берем пациентов строго по дате приезда (arrivalDate) 
    // и ИГНОРИРУЕМ всех, кроме указанных финальных статусов
    const patients = await this.patientRepository.find({
      where: {
        arrivalDate: Between(start, end),
        status: In([
          PatientStatus.NO_ANSWER,
          PatientStatus.WRONG_NUMBER,
          PatientStatus.UNREACHABLE,
          PatientStatus.FEEDBACK_POSITIVE,
          PatientStatus.FEEDBACK_NEGATIVE,
        ]),
      },
      relations: ['callHistory', 'feedbacks'],
    });

    // --- ФОРМАТИРОВАНИЕ ДЛЯ ОТЧЕТА ---
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Отчет');

    const dateRangeStr = `с ${format(start, 'dd.MM.yyyy')} по ${format(end, 'dd.MM.yyyy')}`;
    const titleText = `ПОКАЗАТЕЛИ ОБРАТНОЙ СВЯЗИ ПО ДАТЕ ЗАЕЗДА ЗА ПЕРИОД ${dateRangeStr}`;

    worksheet.mergeCells('A1:AP1');
    const titleRow = worksheet.getCell('A1');
    titleRow.value = titleText.toUpperCase();
    titleRow.font = { name: 'Times New Roman', size: 12, bold: true };
    titleRow.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    worksheet.getRow(1).height = 40;

    worksheet.mergeCells('A2:AP2');
    const subTitleRow = worksheet.getCell('A2');
    subTitleRow.value = 'С П Р А В К А';
    subTitleRow.font = { name: 'Times New Roman', size: 14, bold: true };
    subTitleRow.alignment = { vertical: 'middle', horizontal: 'center' };
    worksheet.getRow(2).height = 25;

    worksheet.addRow([]);

    const header1 = [
      '№', 'Филиал', 'Всего пациентов', 'Дозвонились', '% Дозвона', 
      'Нет ответа', 'Неверный номер', 'Нет связи', 'Всего не дозвонились', '% Недозвона',
      'Жалобы',
      'Врачи (5)', 'Врачи (4)', 'Врачи (3)', 'Врачи (2)',
      'Медсестры (5)', 'Медсестры (4)', 'Медсестры (3)', 'Медсестры (2)',
      'Санитарки (5)', 'Санитарки (4)', 'Санитарки (3)', 'Санитарки (2)',
      'Кухня (5)', 'Кухня (4)', 'Кухня (3)', 'Кухня (2)',
      'Ресепшн (5)', 'Ресепшн (4)', 'Ресепшн (3)', 'Ресепшн (2)',
      'Клиника (5)', 'Клиника (4)', 'Клиника (3)', 'Клиника (2)',
      'Итог (5)', 'Итог (4)', 'Итог (3)', 'Итог (2)',
      'Предложения',
      'Ссылка (Жалоба)',
      'Ссылка (Предложение)'
    ];

    const headerRow = worksheet.addRow(header1);
    headerRow.font = { bold: true };
    headerRow.eachCell((cell) => {
      cell.border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'D9D9D9' } };
    });

    const globalStats = {
      totalPatients: 0, contactedCount: 0, noAnswer: 0, wrongNumber: 0, noConnection: 0,
      notContactedTotal: 0, complaints: 0, suggestions: 0,
      points: {} as Record<string, number>,
      overallScores: { 5: 0, 4: 0, 3: 0, 2: 0 }
    };

    const formatCountPct = (count: number, totalBase: number): string => {
        if (totalBase === 0 || count === 0) return '0 (0.0%)';
        const pct = (count / totalBase) * 100;
        return `${count} (${pct.toFixed(1)}%)`;
    };

    const branchList = [...new Set(patients.map(p => p.branch).filter(Boolean))];

    const categoryMap = {
      doctors: 'doctors',
      nurses: 'nurses',
      cleanliness: 'cleanliness', 
      food: 'food',               
      reception: 'reception',
      clinic: 'clinic'
    };

    const categoriesArray = [
      categoryMap.doctors, categoryMap.nurses, categoryMap.cleanliness, 
      categoryMap.food, categoryMap.reception, categoryMap.clinic
    ];

    branchList.forEach((branch, index) => {
      const branchPatients = patients.filter((p) => p.branch === branch);
      const totalPatients = branchPatients.length; // Это теперь только ТЕ, кого мы отфильтровали

      let bNoAnswer = 0, bWrongNumber = 0, bNoConnection = 0, bContacted = 0, bComplaints = 0, bSuggestions = 0;
      const branchOverallScores = { 5: 0, 4: 0, 3: 0, 2: 0 };
      
      const complaintLinks: string[] = []; 
      const suggestionLinks: string[] = []; 

      branchPatients.forEach((p) => {
        const pFeedbacks = p.feedbacks || [];

        // 2. ПОДСЧЕТ: Строго по финальному статусу пациента
        if (p.status === PatientStatus.NO_ANSWER) {
            bNoAnswer++;
        } else if (p.status === PatientStatus.WRONG_NUMBER) {
            bWrongNumber++;
        } else if (p.status === PatientStatus.UNREACHABLE) {
            bNoConnection++;
        } else if (p.status === PatientStatus.FEEDBACK_POSITIVE || p.status === PatientStatus.FEEDBACK_NEGATIVE) {
            bContacted++;
            if (p.status === PatientStatus.FEEDBACK_NEGATIVE) bComplaints++;
            if (p.status === PatientStatus.FEEDBACK_POSITIVE) bSuggestions++;
        }

        // Обработка оценок из поля JSON `ratings`
        if (pFeedbacks.length > 0) {
            pFeedbacks.forEach(f => {
                if (f.ratings) {
                    categoriesArray.forEach(cat => {
                        // @ts-ignore
                        const val = f.ratings[cat];
                        if (val && val >= 2 && val <= 5) {
                            const key = `${cat}-${val}`;
                            globalStats.points[key] = (globalStats.points[key] || 0) + 1;
                        }
                    });

                    const overallVal = f.ratings['overall'];
                    if (overallVal && overallVal >= 2 && overallVal <= 5) {
                        branchOverallScores[overallVal as keyof typeof branchOverallScores]++;
                        globalStats.overallScores[overallVal as keyof typeof globalStats.overallScores]++;
                    }
                }
            });
        }
      });

      const notContactedTotal = bNoAnswer + bWrongNumber + bNoConnection;
      
      const countPoints = (cat: string, val: number) => {
          let count = 0;
          branchPatients.forEach(p => {
              p.feedbacks?.forEach(f => {
                  // @ts-ignore
                  if (f.ratings && f.ratings[cat] === val) count++;
              });
          });
          return count;
      };

      const maxRows = Math.max(complaintLinks.length, suggestionLinks.length, 1);
      // @ts-ignore
      const startRowNumber = worksheet.lastRow.number + 1;

      for (let i = 0; i < maxRows; i++) {
        const rowValues = Array(42).fill(null);
        if (i === 0) {
          rowValues[0] = index + 1; rowValues[1] = branch; rowValues[2] = totalPatients;
          rowValues[3] = bContacted; rowValues[4] = totalPatients > 0 ? bContacted / totalPatients : 0;
          rowValues[5] = bNoAnswer; rowValues[6] = bWrongNumber; rowValues[7] = bNoConnection;
          rowValues[8] = notContactedTotal; rowValues[9] = totalPatients > 0 ? notContactedTotal / totalPatients : 0;
          rowValues[10] = bComplaints;
          
          let col = 11;
          categoriesArray.forEach(cat => {
            [5, 4, 3, 2].forEach(v => { rowValues[col++] = countPoints(cat, v); });
          });

          rowValues[35] = formatCountPct(branchOverallScores[5], bContacted);
          rowValues[36] = formatCountPct(branchOverallScores[4], bContacted);
          rowValues[37] = formatCountPct(branchOverallScores[3], bContacted);
          rowValues[38] = formatCountPct(branchOverallScores[2], bContacted);
          rowValues[39] = formatCountPct(bSuggestions, bContacted);
        }

        if (complaintLinks[i]) rowValues[40] = { text: `Жалоба-${i+1}`, hyperlink: complaintLinks[i] };
        if (suggestionLinks[i]) rowValues[41] = { text: `Предложение-${i+1}`, hyperlink: suggestionLinks[i] };

        const row = worksheet.addRow(rowValues);
        
        if (i === 0) {
            row.getCell(5).numFmt = '0.0%';
            row.getCell(10).numFmt = '0.0%';
        }

        row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
          cell.border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
          if (colNumber >= 41 && cell.value) cell.font = { color: { argb: '0000FF' }, underline: true };
          if (cell.value === 0 || cell.value === '0 (0.0%)') cell.value = '';
        });
      }

      if (maxRows > 1) {
        for (let col = 1; col <= 40; col++) {
          worksheet.mergeCells(startRowNumber, col, startRowNumber + maxRows - 1, col);
        }
      }

      globalStats.totalPatients += totalPatients; globalStats.contactedCount += bContacted;
      globalStats.noAnswer += bNoAnswer; globalStats.wrongNumber += bWrongNumber;
      globalStats.noConnection += bNoConnection; globalStats.notContactedTotal += notContactedTotal;
      globalStats.complaints += bComplaints; globalStats.suggestions += bSuggestions;
    });

    // --- ИТОГО ---
    const gPctContacted = globalStats.totalPatients > 0 ? globalStats.contactedCount / globalStats.totalPatients : 0;
    const gPctNotContacted = globalStats.totalPatients > 0 ? globalStats.notContactedTotal / globalStats.totalPatients : 0;
    const getG = (cat: string, val: number) => globalStats.points[`${cat}-${val}`] || 0;

    const totalRowValues = [
        'ИТОГО', '', globalStats.totalPatients, globalStats.contactedCount, gPctContacted,
        globalStats.noAnswer, globalStats.wrongNumber, globalStats.noConnection, globalStats.notContactedTotal, gPctNotContacted,
        globalStats.complaints,
        ...categoriesArray.flatMap(cat => 
          [5, 4, 3, 2].map(v => getG(cat, v))
        ),
        formatCountPct(globalStats.overallScores[5], globalStats.contactedCount), formatCountPct(globalStats.overallScores[4], globalStats.contactedCount),
        formatCountPct(globalStats.overallScores[3], globalStats.contactedCount), formatCountPct(globalStats.overallScores[2], globalStats.contactedCount),
        formatCountPct(globalStats.suggestions, globalStats.contactedCount),
    ];

    const totalRow = worksheet.addRow(totalRowValues);
    worksheet.mergeCells(`A${totalRow.number}:B${totalRow.number}`);
    totalRow.getCell(5).numFmt = '0.0%'; totalRow.getCell(10).numFmt = '0.0%';
    totalRow.font = { bold: true };
    totalRow.eachCell((cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'BFBFBF' } };
        cell.border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };
        cell.alignment = { horizontal: 'center' };
        if (cell.value === 0 || cell.value === '0 (0.0%)') cell.value = '';
    });

    worksheet.columns.forEach((col, i) => { 
        if (i === 1) col.width = 20; else if (i >= 40) col.width = 25; else if (i >= 35) col.width = 13; else col.width = 8; 
    });

    // 4. Сохранение файла
    const uint8Array = await workbook.xlsx.writeBuffer();
    const buffer = Buffer.from(uint8Array);
    
    const fileName = `Отчет_${format(start, 'dd.MM.yyyy')}-${format(end, 'dd.MM.yyyy')}_${Date.now()}.xlsx`;
    const fileUrl = await this.filesService.saveBuffer(buffer, fileName, 'reports');

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
    return this.reportRepository.delete(id);
  }
}