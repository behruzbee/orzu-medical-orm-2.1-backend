import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
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

    // 1. Bemorlarni olish
    const patients = await this.patientRepository.find({
      where: {
        departureDate: Between(start, end),
      },
      relations: ['callHistory', 'feedbacks'],
    });

    // 2. Statistika tuzilmasi
    type RatingBreakdown = { 
        5: number; 4: number; 3: number; 2: number; 1: number 
    };

    interface BranchStats {
      total: number;
      contacted: number;
      noAnswer: number;
      wrongNumber: number;
      unreachable: number;
      
      // Ratings (Soni)
      doctors: RatingBreakdown;
      nurses: RatingBreakdown;
      food: RatingBreakdown;
      cleanliness: RatingBreakdown;
      overall: RatingBreakdown;
    }

    const initRatings = (): RatingBreakdown => ({ 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 });

    const stats: Record<string, BranchStats> = {};
    const globalStats: BranchStats = {
      total: 0, contacted: 0, noAnswer: 0, wrongNumber: 0, unreachable: 0,
      doctors: initRatings(), nurses: initRatings(), food: initRatings(), cleanliness: initRatings(), overall: initRatings(),
    };

    const getOrInitBranch = (name: string) => {
      if (!stats[name]) {
        stats[name] = {
          total: 0, contacted: 0, noAnswer: 0, wrongNumber: 0, unreachable: 0,
          doctors: initRatings(), nurses: initRatings(), food: initRatings(), cleanliness: initRatings(), overall: initRatings(),
        };
      }
      return stats[name];
    };

    const processRating = (
        branchStats: BranchStats, 
        category: keyof BranchStats, 
        score: number
    ) => {
        const s = Math.round(score);
        if (s >= 1 && s <= 5) {
            // @ts-ignore
            branchStats[category][s]++;
            // @ts-ignore
            globalStats[category][s]++;
        }
    };

    // 3. Hisoblash
    patients.forEach((p) => {
      const branch = getOrInitBranch(p.branch || 'Noma\'lum');
      
      branch.total++;
      globalStats.total++;

      const callsInPeriod = p.callHistory.filter(c => {
        const cDate = new Date(c.createdAt);
        return cDate >= start && cDate <= end;
      });

      const hasNoAnswer = callsInPeriod.some(c => c.status === PatientStatus.NO_ANSWER);
      const hasWrongNumber = callsInPeriod.some(c => c.status === PatientStatus.WRONG_NUMBER);
      const hasUnreachable = callsInPeriod.some(c => c.status === PatientStatus.UNREACHABLE);

      if (hasNoAnswer) { branch.noAnswer++; globalStats.noAnswer++; }
      if (hasWrongNumber) { branch.wrongNumber++; globalStats.wrongNumber++; }
      if (hasUnreachable) { branch.unreachable++; globalStats.unreachable++; }

      if (!hasNoAnswer && !hasWrongNumber && !hasUnreachable) {
        branch.contacted++;
        globalStats.contacted++;
      }

      if (p.feedbacks && p.feedbacks.length > 0) {
        p.feedbacks.forEach(f => {
          if (f.ratings) {
             if (f.ratings.doctors) processRating(branch, 'doctors', f.ratings.doctors);
             if (f.ratings.nurses) processRating(branch, 'nurses', f.ratings.nurses);
             if (f.ratings.food) processRating(branch, 'food', f.ratings.food);
             if (f.ratings.cleanliness) processRating(branch, 'cleanliness', f.ratings.cleanliness);
             if (f.ratings.overall) processRating(branch, 'overall', f.ratings.overall);
          }
        });
      }
    });

    // 4. Excel generatsiya
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Batafsil Hisobot');

    // --- Sarlavha (Title) ---
    // 1-qator: Katta sarlavha
    const dateRangeStr = `${format(start, 'dd.MM.yyyy')} дан ${format(end, 'dd.MM.yyyy')} гача`;
    const titleText = `ОРЗУ МЕДИКАЛ клиникаларининг ${dateRangeStr} ётган беморларнинг кайта алокага олинганлар буйича курсаткичлари тугрисида`;
    
    worksheet.mergeCells('A1:AM1'); // Kengaytiramiz (AM ustunigacha)
    const titleRow = worksheet.getCell('A1');
    titleRow.value = titleText.toUpperCase();
    titleRow.font = { name: 'Times New Roman', size: 12, bold: true };
    titleRow.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    worksheet.getRow(1).height = 40;

    // 2-qator: MA'LUMOTNOMA
    worksheet.mergeCells('A2:AM2');
    const subTitleRow = worksheet.getCell('A2');
    subTitleRow.value = "М А Ъ Л У М О Т Н О М А";
    subTitleRow.font = { name: 'Times New Roman', size: 14, bold: true };
    subTitleRow.alignment = { vertical: 'middle', horizontal: 'center' };
    worksheet.getRow(2).height = 25;

    // 3-qator: Bo'sh joy
    worksheet.addRow([]); 

    // --- Header ---
    const headerRowValues = [
        'Filial', 
        'Kelgan Bemorlar', 
        "Bog'lanildi (Soni)", 
        "Bog'lanildi (%)", 
        "Ko'tarmadi", 
        "Noto'g'ri raqam", 
        "O'chirilgan", 
        "Jami (Nogiron)", 
        "Jami (%)", 
        
        // Soni
        'Vrachlar (5)', 'Vrachlar (4)', 'Vrachlar (3)', 'Vrachlar (2)', 'Vrachlar (1)',
        'Hamshiralar (5)', 'Hamshiralar (4)', 'Hamshiralar (3)', 'Hamshiralar (2)', 'Hamshiralar (1)',
        'Taomlar (5)', 'Taomlar (4)', 'Taomlar (3)', 'Taomlar (2)', 'Taomlar (1)',
        'Tozalik (5)', 'Tozalik (4)', 'Tozalik (3)', 'Tozalik (2)', 'Tozalik (1)',
        'Umumiy (5)', 'Umumiy (4)', 'Umumiy (3)', 'Umumiy (2)', 'Umumiy (1)',
        
        // Yangi: Foizlar (Jami bemorga nisbatan)
        'Umumiy % (5)', 'Umumiy % (4)', 'Umumiy % (3)', 'Umumiy % (2)', 'Umumiy % (1)'
    ];

    const hRow = worksheet.addRow(headerRowValues);
    hRow.height = 60; // Header balandroq bo'lishi kerak
    
    hRow.eachCell((cell, colNumber) => {
        cell.font = { bold: true, color: { argb: 'FFFFFF' }, size: 9, name: 'Times New Roman' };
        cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        cell.border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };

        // Ranglar
        if (colNumber <= 9) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '4472C4' } }; // Ko'k
        else if (colNumber <= 14) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'ED7D31' } }; // Vrach
        else if (colNumber <= 19) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '70AD47' } }; // Hamshira
        else if (colNumber <= 24) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC000' } }; // Taom
        else if (colNumber <= 29) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '5B9BD5' } }; // Tozalik
        else if (colNumber <= 34) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'A5A5A5' } }; // Umumiy
        else cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '000000' } }; // Foizlar (Qora)
    });

    // Helper: 0 ni bo'sh stringga aylantirish
    const fmt = (val: number) => val === 0 ? '' : val;
    const fmtPct = (val: number, total: number) => {
        if (total === 0 || val === 0) return '';
        return ((val / total) * 100).toFixed(1) + '%';
    };

    const createRowData = (name: string, s: BranchStats) => {
        const totalNegative = s.noAnswer + s.wrongNumber + s.unreachable;

        return [
            name,
            fmt(s.total),
            fmt(s.contacted),
            fmtPct(s.contacted, s.total),
            fmt(s.noAnswer),
            fmt(s.wrongNumber),
            fmt(s.unreachable),
            fmt(totalNegative),
            fmtPct(totalNegative, s.total),

            // Vrachlar
            fmt(s.doctors[5]), fmt(s.doctors[4]), fmt(s.doctors[3]), fmt(s.doctors[2]), fmt(s.doctors[1]),
            // Hamshiralar
            fmt(s.nurses[5]), fmt(s.nurses[4]), fmt(s.nurses[3]), fmt(s.nurses[2]), fmt(s.nurses[1]),
            // Taomlar
            fmt(s.food[5]), fmt(s.food[4]), fmt(s.food[3]), fmt(s.food[2]), fmt(s.food[1]),
            // Tozalik
            fmt(s.cleanliness[5]), fmt(s.cleanliness[4]), fmt(s.cleanliness[3]), fmt(s.cleanliness[2]), fmt(s.cleanliness[1]),
            // Umumiy (Soni)
            fmt(s.overall[5]), fmt(s.overall[4]), fmt(s.overall[3]), fmt(s.overall[2]), fmt(s.overall[1]),
            
            // Umumiy (Foiz - Jami bemorlar soniga nisbatan)
            fmtPct(s.overall[5], s.total),
            fmtPct(s.overall[4], s.total),
            fmtPct(s.overall[3], s.total),
            fmtPct(s.overall[2], s.total),
            fmtPct(s.overall[1], s.total),
        ];
    };

    // Filiallar
    Object.entries(stats).forEach(([name, s]) => {
        const row = worksheet.addRow(createRowData(name, s));
        row.eachCell(cell => {
            cell.alignment = { horizontal: 'center', vertical: 'middle' };
            cell.border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };
            cell.font = { name: 'Times New Roman', size: 10 };
        });
    });

    // JAMI
    const totalRow = worksheet.addRow(createRowData('JAMI', globalStats));
    totalRow.height = 25;
    totalRow.eachCell(cell => {
        cell.font = { bold: true, name: 'Times New Roman', size: 10 };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'D9D9D9' } };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };
    });

    // Ustun kengliklari
    worksheet.getColumn(1).width = 25; // Filial
    for(let i=2; i<=40; i++) {
        worksheet.getColumn(i).width = 8; // Raqamlar uchun kichik
    }

    // Saqlash
    const uint8Array = await workbook.xlsx.writeBuffer();
    const buffer = Buffer.from(uint8Array);
    const fileName = `Hisobot_${format(start, 'dd.MM.yyyy')}-${format(end, 'dd.MM.yyyy')}_${Date.now()}.xlsx`;
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