import {
  Injectable,
  ConflictException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Patient } from '../entities/patient.entity';
import { CreatePatientDto } from '../dto/create-patient.dto';
import { FindAllPatientsDto } from '../dto/find-all-patients.dto';
import { PatientStatus } from 'src/common/enums/patient-status.enum';
import { getRandomColor } from 'src/common/utils/color.util';

@Injectable()
export class PatientsService {
  private readonly logger = new Logger(PatientsService.name);

  constructor(
    @InjectRepository(Patient)
    private patientRepository: Repository<Patient>,
  ) {}

  async createFromExternal(dto: CreatePatientDto) {
    const exists = await this.patientRepository.findOne({
      where: { phone: dto.phone },
    });
    
    if (exists) {
      this.logger.warn(`Duplicate patient attempt: ${dto.phone}`);
      throw new ConflictException('Bemor allaqachon mavjud');
    }

    const color = dto.avatarColor || getRandomColor();

    const patient = this.patientRepository.create({
      ...dto,
      status: PatientStatus.NEW,
      avatarColor: color,
      departureDate: new Date(dto.departureDate),
      arrivalDate: new Date(dto.arrivalDate),
    });

    return this.patientRepository.save(patient);
  }

  async findAll(query: FindAllPatientsDto) {
    const {
      page = 1,
      limit = 10,
      search,
      status,
      branch,
      phoneCode,
      dateFrom,
      dateTo,
    } = query;

    const skip = (page - 1) * limit;

    const qb = this.patientRepository.createQueryBuilder('patient');

    // 1. Статус
    if (status) {
      qb.andWhere('patient.status = :status', { status });
    }

    // 2. Филиал (Branch)
    if (branch) {
      qb.andWhere('patient.branch = :branch', { branch });
    }

    // 3. Код телефона (Страна)
    const COUNTRY_CODES: Record<string, string> = {
      Russia: '+7',
      Uzbekistan: '+998',
      Kazakhstan: '+77',
      USA: '+1',
      Turkey: '+90',
      Korea: '+82',
    };

    if (phoneCode) {
      const code = COUNTRY_CODES[phoneCode] || phoneCode;
      qb.andWhere('patient.phone LIKE :phoneCode', {
        phoneCode: `%${code}%`,
      });
    }

    // 4. Фильтр по дате вылета (Departure Date)
    if (dateFrom && dateTo) {
      qb.andWhere('patient.arrivalDate BETWEEN :dateFrom AND :dateTo', {
        dateFrom,
        dateTo,
      });
    } else if (dateFrom) {
      qb.andWhere('patient.arrivalDate >= :dateFrom', { dateFrom });
    }

    // 5. Общий поиск (Search input)
    if (search) {
      qb.andWhere(
        '(patient.name ILIKE :search OR patient.phone ILIKE :search)',
        { search: `%${search}%` },
      );
    }

    // Сортировка и пагинация
    qb.orderBy('patient.createdAt', 'DESC');
    qb.skip(skip).take(limit);

    const [data, total] = await qb.getManyAndCount();

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string) {
    const patient = await this.patientRepository.findOne({
      where: { id },
      relations: ['feedbacks', 'callHistory', 'feedbacks.evidenceMessages'],
    });
    
    if (!patient) throw new NotFoundException('Bemor topilmadi');
    
    return patient;
  }

  async updateStatus(id: string, status: PatientStatus) {
    const patient = await this.findOne(id);
    patient.status = status;
    return this.patientRepository.save(patient);
  }

  async remove(id: string) {
    const result = await this.patientRepository.delete(id);
    if (result.affected === 0) throw new NotFoundException('Bemor topilmadi');
    return { message: "Bemor va uning barcha ma'lumotlari o'chirildi" };
  }
}