import { normalizePhone } from 'src/common/utils/phone.util';
import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as xlsx from 'xlsx';
import { Patient } from '../entities/patient.entity';
import { PatientStatus } from 'src/common/enums/patient-status.enum';
import { isPossibleDate, parseExcelDate } from 'src/common/utils/date.util';
import { getRandomColor } from 'src/common/utils/color.util';

@Injectable()
export class PatientsImportService {
  private readonly logger = new Logger(PatientsImportService.name);

  constructor(
    @InjectRepository(Patient)
    private patientRepository: Repository<Patient>,
  ) {}

  async importFromExcel(buffer: Buffer) {
    this.logger.log('🟢 Начинается импорт Excel...');
    try {
      const workbook = xlsx.read(buffer, { type: 'buffer', cellDates: true });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const rows = xlsx.utils.sheet_to_json<any[]>(sheet, { header: 1, defval: '', raw: false });

      if (rows.length < 2) {
        throw new BadRequestException('Файл пустой или нет данных');
      }

      let imported = 0;
      let skippedDuplicates = 0;
      let errors = 0;
      const errorDetails: { line: number; reason: string }[] = [];

      // 0. Извлекаем глобальное название филиала из заголовка документа
      let globalBranchName = "Noma'lum";
      for (let i = 0; i < Math.min(5, rows.length); i++) {
        const rowText = rows[i].map(cell => String(cell || '').trim()).join(' ');
        const match = rowText.match(/["«“”]([^"»“”]+)["»“”]/);
        if (match && match[1]) {
          globalBranchName = match[1].trim(); 
          this.logger.log(`🏢 Найден филиал в заголовке: ${globalBranchName}`);
          break;
        }
      }

      // 1. Ищем строку с заголовками таблицы
      let fioIdx = -1, phoneIdx = -1, branchIdx = -1, arrivalIdx = -1, departureIdx = -1;
      let headerRowIndex = -1;

      for (let i = 0; i < Math.min(10, rows.length); i++) {
        const cols = this.detectColumns(rows[i]);
        if (cols.fioIndex !== -1 && cols.phoneIndex !== -1) {
          fioIdx = cols.fioIndex;
          phoneIdx = cols.phoneIndex;
          branchIdx = cols.branchIndex;
          arrivalIdx = cols.arrivalIndex;
          departureIdx = cols.departureIndex;
          headerRowIndex = i;
          break;
        }
      }

      let currentArrivalDate = new Date();
      const startIndex = headerRowIndex !== -1 ? headerRowIndex + 1 : 0;

      for (let i = startIndex; i < rows.length; i++) {
        const row = rows[i];
        const lineNumber = i + 1;

        if (row.every((cell) => String(cell).trim() === '')) continue;

        let nameInput = '';
        let phoneInput = '';
        let branchInput = '';
        let arrDate = currentArrivalDate; 
        let depDate: Date | null = null;

        // Извлекаем данные по найденным колонкам
        if (fioIdx !== -1 && phoneIdx !== -1) {
          nameInput = String(row[fioIdx] || '').trim();
          phoneInput = String(row[phoneIdx] || '').trim();
          branchInput = branchIdx !== -1 ? String(row[branchIdx] || '').trim() : '';

          // Парсинг даты прихода (Келган сана)
          if (arrivalIdx !== -1 && row[arrivalIdx]) {
            const parsed = parseExcelDate(row[arrivalIdx]);
            if (parsed) arrDate = parsed;
          }

          // Парсинг даты отъезда (Кетган санаси)
          if (departureIdx !== -1 && row[departureIdx]) {
            const parsed = parseExcelDate(row[departureIdx]);
            if (parsed) depDate = parsed;
          }
        } else {
          // Эвристика, если заголовки вообще не найдены
          const dateCandidate = row.find((val) => isPossibleDate(val));
          if (dateCandidate) {
            const parsed = parseExcelDate(dateCandidate);
            if (parsed) arrDate = parsed;
          }
          
          for (const cell of row) {
            const val = String(cell).trim();
            if (!val || isPossibleDate(val)) continue;

            const digits = val.replace(/\D/g, '');
            if (digits.length >= 8) phoneInput = val;
            else if (!nameInput) nameInput = val;
            else if (!branchInput) branchInput = val;
          }
        }

        // Сохраняем дату для следующих строк (если в них пусто)
        currentArrivalDate = arrDate;

        // Если строка техническая (например, просто цифры "1, 2, 3, 4" под заголовками) - пропускаем
        if (nameInput && nameInput.length < 3 && !isNaN(Number(nameInput))) {
          continue; 
        }

        if (!nameInput && !phoneInput) continue;

        if (!phoneInput) {
          errors++;
          errorDetails.push({ line: lineNumber, reason: 'Пустой телефон' });
          continue;
        }
        if (!nameInput) {
          errors++;
          errorDetails.push({ line: lineNumber, reason: 'Пустое имя' });
          continue;
        }

        const normalizedPhone = normalizePhone(phoneInput);
        if (!normalizedPhone.valid) {
          errors++;
          errorDetails.push({ line: lineNumber, reason: `Некорректный телефон: ${phoneInput}` });
          continue;
        }

        const exists = await this.patientRepository.findOne({
          where: { phone: normalizedPhone.value },
        });

        if (exists) {
          skippedDuplicates++;
          continue;
        }

        // Если дата отъезда пустая в таблице — прибавляем 10 дней по умолчанию
        if (!depDate) {
          depDate = new Date(arrDate);
          depDate.setDate(depDate.getDate() + 10);
        }

        const finalBranch = branchInput || globalBranchName;

        const patient = this.patientRepository.create({
          name: nameInput,
          phone: normalizedPhone.value,
          branch: finalBranch,
          arrivalDate: arrDate,         // Точная дата прихода
          departureDate: depDate,       // Точная дата отъезда
          status: PatientStatus.NEW,
          avatarColor: getRandomColor(),
        });

        await this.patientRepository.save(patient);
        imported++;
      }

      const report = { totalRows: rows.length - 1, imported, skippedDuplicates, errors, errorDetails };
      this.logger.log(`📋 Итоговый отчёт импорта: ${JSON.stringify(report)}`);
      return report;

    } catch (err) {
      this.logger.error(`🔥 Ошибка импорта: ${err.message}`);
      throw new BadRequestException(`Ошибка при импорте: ${err.message}`);
    }
  }

  private detectColumns(headers: any[]) {
    const normalize = (s: string) => String(s).toLowerCase().replace(/\s+/g, '');
    let fioIndex = -1, phoneIndex = -1, branchIndex = -1;
    let arrivalIndex = -1, departureIndex = -1;

    headers.forEach((h, idx) => {
      if (!h) return;
      const header = normalize(h);
      
      // Имя
      if (header.includes('фио') || header.includes('имя') || header.includes('фамил') || header.includes('исм')) fioIndex = idx;
      // Телефон (Убрали 'раками' и 'номер', чтобы не путать с "Бино раками")
      else if (header.includes('тел')) phoneIndex = idx;
      // Филиал
      else if (header.includes('филиал') || header.includes('branch')) branchIndex = idx;
      // Дата прихода
      else if (header.includes('келган') || header.includes('приход') || header.includes('поступ') || header.includes('келиш')) arrivalIndex = idx;
      // Дата отъезда
      else if (header.includes('кетган') || header.includes('отъезд') || header.includes('выписк') || header.includes('кетиш')) departureIndex = idx;
    });

    return { fioIndex, phoneIndex, branchIndex, arrivalIndex, departureIndex };
  }
}