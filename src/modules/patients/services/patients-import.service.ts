import {
  Injectable,
  BadRequestException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, LessThan } from 'typeorm';
import * as xlsx from 'xlsx';
import { v4 as uuidv4 } from 'uuid';

import { Patient } from '../entities/patient.entity';
import { PatientRequest } from '../entities/patient_requests.entity';
import { PatientImportTemp } from '../entities/patient-import-temp.entity';
import { RequestStatus } from 'src/common/enums/request-status.enum';
import { normalizePhone } from 'src/common/utils/phone.util';
import { parseExcelDate } from 'src/common/utils/date.util';
import { ImportErrorLog } from '../entities/import-error-log.entity';
import { getRandomColor } from 'src/common/utils/color.util';
import { Cron, CronExpression } from '@nestjs/schedule';

@Injectable()
export class PatientsImportService {
  private readonly logger = new Logger(PatientsImportService.name);

  constructor(
    @InjectRepository(Patient)
    private patientRepository: Repository<Patient>,
    @InjectRepository(PatientRequest)
    private requestRepository: Repository<PatientRequest>,
    @InjectRepository(PatientImportTemp)
    private tempRepository: Repository<PatientImportTemp>,
    @InjectRepository(ImportErrorLog)
    private errorLogRepository: Repository<ImportErrorLog>,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async cleanUpOrphanedTempData() {
    this.logger.log('🧹 Запуск очистки устаревших временных данных импорта...');

    const twoHoursAgo = new Date();
    twoHoursAgo.setHours(twoHoursAgo.getHours() - 2);

    try {
      const result = await this.tempRepository.delete({
        createdAt: LessThan(twoHoursAgo),
      });

      if (result?.affected && result.affected > 0) {
        this.logger.log(
          `🗑️ Успешно удалено ${result.affected} мусорных строк из временной таблицы.`,
        );
      }
    } catch (error) {
      this.logger.error(`❌ Ошибка при очистке мусора: ${error.message}`);
    }
  }

  async previewImportFromExcel(buffer: Buffer) {
    this.logger.log('🟢 Excel faylini dastlabki tahlil qilish boshlandi...');
    try {
      const workbook = xlsx.read(buffer, { type: 'buffer', cellDates: true });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = xlsx.utils.sheet_to_json<any[]>(sheet, {
        header: 1,
        defval: '',
        raw: false,
      });

      if (rows.length < 2) {
        throw new BadRequestException("Fayl bo'sh yoki ma'lumotlar yo'q");
      }

      const sessionId = uuidv4();
      const tempRecords: PatientImportTemp[] = [];
      const seenPhonesInFile = new Map<string, number>();

      const missingDatesRows: number[] = [];

      let globalBranchName = "Noma'lum";
      for (let i = 0; i < Math.min(5, rows.length); i++) {
        const rowText = rows[i]
          .map((cell) => String(cell || '').trim())
          .join(' ');
        const match = rowText.match(/["«“”]([^"»“”]+)["»“”]/);
        if (match && match[1]) {
          globalBranchName = match[1].trim();
          break;
        }
      }

      let fioIdx = -1,
        phoneIdx = -1,
        branchIdx = -1,
        arrivalIdx = -1,
        departureIdx = -1;
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

      const startIndex = headerRowIndex !== -1 ? headerRowIndex + 1 : 0;

      for (let i = startIndex; i < rows.length; i++) {
        const row = rows[i];
        const lineNumber = i + 1;

        if (row.every((cell) => String(cell).trim() === '')) continue;

        let nameInput = '';
        let phoneInput = '';
        let branchInput = '';

        let arrDate: Date | null = null;
        let depDate: Date | null = null;

        if (fioIdx !== -1 && phoneIdx !== -1) {
          nameInput = String(row[fioIdx] || '').trim();
          phoneInput = String(row[phoneIdx] || '').trim();
          branchInput =
            branchIdx !== -1 ? String(row[branchIdx] || '').trim() : '';

          if (arrivalIdx !== -1 && row[arrivalIdx]) {
            const parsed = parseExcelDate(row[arrivalIdx]);
            if (parsed) arrDate = parsed;
          }
          if (departureIdx !== -1 && row[departureIdx]) {
            const parsed = parseExcelDate(row[departureIdx]);
            if (parsed) depDate = parsed;
          }
        }

        if (nameInput && nameInput.length < 3 && !isNaN(Number(nameInput)))
          continue;
        if (!nameInput && !phoneInput) continue;

        if (!arrDate || !depDate) {
          missingDatesRows.push(lineNumber);
          continue;
        }

        const errors: string[] = [];
        let cleanPhone = phoneInput;

        // 🇺🇿 ОШИБКИ НА УЗБЕКСКОМ
        if (!nameInput) errors.push('Ism kiritilmagan');
        if (!phoneInput) {
          errors.push('Telefon raqami kiritilmagan');
        } else {
          const normalized = normalizePhone(phoneInput);
          if (!normalized.valid) {
            errors.push(`Noto'g'ri telefon raqami: ${phoneInput}`);
          } else {
            cleanPhone = normalized.value;

            if (seenPhonesInFile.has(cleanPhone)) {
              errors.push(
                `Fayl ichida takrorlangan raqam (${seenPhonesInFile.get(cleanPhone)}-qator)`,
              );
            } else {
              seenPhonesInFile.set(cleanPhone, lineNumber);

              const activeRequest = await this.requestRepository.findOne({
                where: {
                  status: In([RequestStatus.NEW, RequestStatus.CONTACTED]),
                  patient: { phone: cleanPhone },
                },
              });

              if (activeRequest) {
                errors.push(
                  `Bemorning faol arizasi mavjud (Holati: ${activeRequest.status.toUpperCase()})`,
                );
              }
            }
          }
        }

        const tempRecord = this.tempRepository.create({
          sessionId,
          lineNumber,
          name: nameInput,
          phone: cleanPhone,
          branch: branchInput || globalBranchName,
          arrivalDate: arrDate,
          departureDate: depDate,
          hasErrors: errors.length > 0,
          errorDetails: errors,
        });

        tempRecords.push(tempRecord);
      }

      if (missingDatesRows.length > 0) {
        throw new BadRequestException(
          `Fayl qabul qilinmadi! Quyidagi qatorlarda "Kelgan sana" yoki "Ketgan sana" kiritilmagan: ${missingDatesRows.join(', ')}. Iltimos, kataklarni to'ldirib, qaytadan yuklang.`,
        );
      }

      await this.tempRepository.save(tempRecords);

      return {
        sessionId,
        totalParsed: tempRecords.length,
        validCount: tempRecords.filter((r) => !r.hasErrors).length,
        errorCount: tempRecords.filter((r) => r.hasErrors).length,
      };
    } catch (err) {
      this.logger.error(`Import tahlilida xatolik: ${err.message}`);

      if (err instanceof BadRequestException) {
        throw err;
      }

      throw new BadRequestException(
        `Faylni tahlil qilishda xatolik yuz berdi: ${err.message}`,
      );
    }
  }

  async commitImport(sessionId: string) {
    const records = await this.tempRepository.find({ where: { sessionId } });

    if (!records.length) {
      throw new NotFoundException(
        'Import sessiyasi topilmadi yoki allaqachon ishlangan',
      );
    }

    const validRecords = records.filter((r) => !r.hasErrors);
    const errorRecords = records.filter((r) => r.hasErrors);

    let importedCount = 0;
    let errorsSavedCount = 0;

    await this.patientRepository.manager.transaction(async (manager) => {
      const patientRepo = manager.getRepository(Patient);
      const requestRepo = manager.getRepository(PatientRequest);
      const tempRepo = manager.getRepository(PatientImportTemp);
      const errorLogRepo = manager.getRepository(ImportErrorLog);

      if (validRecords.length > 0) {
        const phones = Array.from(
          new Set(validRecords.map((r) => r.phone).filter(Boolean)),
        );

        const existingPatients = phones.length
          ? await patientRepo.find({ where: { phone: In(phones) } })
          : [];
        const phoneToPatient = new Map<string, Patient>(
          existingPatients.map((p) => [p.phone, p]),
        );

        const patientsToCreate: Patient[] = [];
        const phonesToCreate = new Set<string>();
        for (const rec of validRecords) {
          if (!rec.phone) continue;
          if (!phoneToPatient.has(rec.phone)) {
            const p = patientRepo.create({
              name: rec.name,
              phone: rec.phone,
              avatarColor: getRandomColor(),
            });
            patientsToCreate.push(p);
            phonesToCreate.add(rec.phone);
          }
        }

        if (patientsToCreate.length > 0) {
          try {
            const created = await patientRepo.save(patientsToCreate);
            for (const p of created) {
              phoneToPatient.set(p.phone, p);
            }
          } catch (err: any) {
            if (err?.code === '23505' || err?.errno === 1062) {
              const reloaded = await patientRepo.find({
                where: { phone: In(Array.from(phonesToCreate)) },
              });
              for (const p of reloaded) phoneToPatient.set(p.phone, p);
            } else {
              throw err;
            }
          }
        }

        const requestsToSave = validRecords
          .map((rec) => {
            const patient = phoneToPatient.get(rec.phone);
            if (!patient?.id) return null;
            return requestRepo.create({
              patientId: patient.id,
              branch: rec.branch,
              arrivalDate: rec.arrivalDate,
              departureDate: rec.departureDate,
              status: RequestStatus.NEW,
            });
          })
          .filter((r): r is PatientRequest => r !== null);

        if (requestsToSave.length > 0) {
          const savedRequests = await requestRepo.save(requestsToSave);
          importedCount = savedRequests.length;
        }
      }
      if (errorRecords.length > 0) {
        const errorLogsToSave = errorRecords.map((record) => {
          let category = 'OTHER';
          const errString = record.errorDetails.join(' ');

          if (errString.includes('faol arizasi mavjud')) {
            category = 'ACTIVE_REQUEST_EXISTS';
          } else if (errString.includes('bazada mavjud')) {
            category = 'DUPLICATE_DB';
          } else if (errString.includes('Fayl ichida takrorlangan')) {
            category = 'DUPLICATE_FILE';
          } else if (errString.includes("Noto'g'ri telefon raqami")) {
            category = 'INVALID_PHONE';
          } else if (
            errString.includes('Ism kiritilmagan') ||
            errString.includes('Telefon raqami kiritilmagan')
          ) {
            category = 'MISSING_DATA';
          }

          return errorLogRepo.create({
            sessionId,
            lineNumber: record.lineNumber,
            name: record.name,
            phone: record.phone,
            branch: record.branch,
            arrivalDate: record.arrivalDate,
            departureDate: record.departureDate,
            category,
            errorMessages: record.errorDetails,
          });
        });

        const savedLogs = await errorLogRepo.save(errorLogsToSave);
        errorsSavedCount = savedLogs.length;
      }

      await tempRepo.delete({ sessionId });
    });

    return {
      success: true,
      imported: importedCount,
      errorsLogged: errorsSavedCount,
    };
  }

  async getPreview(sessionId: string) {
    const rows = await this.tempRepository.find({
      where: { sessionId },
      order: { lineNumber: 'ASC' },
    });

    let validCount = 0;
    let errorCount = 0;

    const categoriesCount = {
      ACTIVE_REQUEST_EXISTS: 0,
      DUPLICATE_FILE: 0,
      INVALID_PHONE: 0,
      MISSING_DATA: 0,
      OTHER: 0,
    };

    for (const row of rows) {
      if (!row.hasErrors) {
        validCount++;
      } else {
        errorCount++;
        const errString = row.errorDetails.join(' ');

        // 🇺🇿 СИНХРОНИЗИРОВАННЫЕ ПРОВЕРКИ
        if (errString.includes('faol arizasi mavjud')) {
          categoriesCount.ACTIVE_REQUEST_EXISTS++;
        } else if (errString.includes('Fayl ichida takrorlangan')) {
          categoriesCount.DUPLICATE_FILE++;
        } else if (errString.includes("Noto'g'ri telefon raqami")) {
          categoriesCount.INVALID_PHONE++;
        } else if (
          errString.includes('Ism kiritilmagan') ||
          errString.includes('Telefon raqami kiritilmagan')
        ) {
          categoriesCount.MISSING_DATA++;
        } else {
          categoriesCount.OTHER++;
        }
      }
    }

    return {
      stats: {
        total: rows.length,
        valid: validCount,
        errors: errorCount,
        categories: categoriesCount,
      },
      rows,
    };
  }

  async cancelImport(sessionId: string) {
    await this.tempRepository.delete({ sessionId });
    return {
      success: true,
      message: "Import bekor qilindi, vaqtinchalik ma'lumotlar o'chirildi",
    };
  }

  private detectColumns(headers: any[]) {
    const normalize = (s: string) =>
      String(s).toLowerCase().replace(/\s+/g, '');
    let fioIndex = -1,
      phoneIndex = -1,
      branchIndex = -1,
      arrivalIndex = -1,
      departureIndex = -1;
    headers.forEach((h, idx) => {
      if (!h) return;
      const header = normalize(h);
      if (
        header.includes('фио') ||
        header.includes('имя') ||
        header.includes('фамил') ||
        header.includes('исм')
      )
        fioIndex = idx;
      else if (header.includes('тел')) phoneIndex = idx;
      else if (header.includes('филиал') || header.includes('branch'))
        branchIndex = idx;
      else if (
        header.includes('келган') ||
        header.includes('приход') ||
        header.includes('поступ') ||
        header.includes('келиш')
      )
        arrivalIndex = idx;
      else if (
        header.includes('кетган') ||
        header.includes('отъезд') ||
        header.includes('выписк') ||
        header.includes('кетиш')
      )
        departureIndex = idx;
    });
    return { fioIndex, phoneIndex, branchIndex, arrivalIndex, departureIndex };
  }
}
