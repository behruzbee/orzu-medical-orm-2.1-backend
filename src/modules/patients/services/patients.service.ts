import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Patient } from '../entities/patient.entity';
import { PatientRequest } from '../entities/patient_requests.entity';
import { FindAllPatientsDto } from '../dto/find-all-patients.dto';

@Injectable()
export class PatientsService {
  private readonly logger = new Logger(PatientsService.name);

  constructor(
    @InjectRepository(PatientRequest)
    private requestRepository: Repository<PatientRequest>,

    @InjectRepository(Patient)
    private patientRepository: Repository<Patient>,
  ) {}

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

    const qb = this.requestRepository
      .createQueryBuilder('request')
      .leftJoinAndSelect('request.patient', 'patient')
      .leftJoinAndSelect('request.callStatus', 'callStatus')
      .leftJoinAndSelect('request.feedback', 'feedback');

    if (status) {
      qb.andWhere('request.status = :status', { status });
    }

    if (branch) {
      qb.andWhere('request.branch = :branch', { branch });
    }

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

    if (dateFrom && dateTo) {
      qb.andWhere('request.arrivalDate BETWEEN :dateFrom AND :dateTo', {
        dateFrom,
        dateTo,
      });
    } else if (dateFrom) {
      qb.andWhere('request.arrivalDate >= :dateFrom', { dateFrom });
    }

    if (search) {
      qb.andWhere(
        '(patient.name ILIKE :search OR patient.phone ILIKE :search)',
        { search: `%${search}%` },
      );
    }

    qb.orderBy('request.createdAt', 'DESC');
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

  async findOneRequest(id: string) {
    const request = await this.requestRepository.findOne({
      where: { id },
      relations: [
        'patient',
        'callStatus',
        'feedback',
        'feedback.evidenceMessages',
      ],
    });

    if (!request) throw new NotFoundException('Arizani (Заявку) topilmadi');

    return request;
  }
  async findOnePatientProfile(patientId: string) {
    const patient = await this.patientRepository.findOne({
      where: { id: patientId },
      relations: [
        'requests',
        'requests.callStatus',
        'requests.feedback',
        'requests.feedback.evidenceMessages',
      ],
    });

    if (!patient) throw new NotFoundException('Bemor topilmadi');

    return patient;
  }
}
