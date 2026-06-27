import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';

import { Patient } from '../entities/patient.entity';
import { PatientRequest } from '../entities/patient_requests.entity';
import { FindAllPatientsDto } from '../dto/find-all-patients.dto';
import { CreateIntegrationRequestDto } from '../dto/create-integration-request.dto';
import { RequestStatus } from 'src/common/enums/request-status.enum';
import { normalizePhone } from 'src/common/utils/phone.util';
import { getRandomColor } from 'src/common/utils/color.util';

@Injectable()
export class PatientsService {
  private readonly logger = new Logger(PatientsService.name);

  constructor(
    @InjectRepository(PatientRequest)
    private requestRepository: Repository<PatientRequest>,

    @InjectRepository(Patient)
    private patientRepository: Repository<Patient>,
  ) {}

  async createFromIntegration(dto: CreateIntegrationRequestDto) {
    const normalizedPhone = normalizePhone(dto.phone);

    if (!normalizedPhone.valid) {
      throw new BadRequestException("Telefon raqami noto'g'ri formatda");
    }

    const arrivalDate = new Date(dto.arrivalDate);
    const departureDate = new Date(dto.departureDate);

    if (Number.isNaN(arrivalDate.getTime())) {
      throw new BadRequestException('arrivalDate must be a valid ISO date');
    }

    if (Number.isNaN(departureDate.getTime())) {
      throw new BadRequestException('departureDate must be a valid ISO date');
    }

    if (departureDate.getTime() < arrivalDate.getTime()) {
      throw new BadRequestException('departureDate must be after arrivalDate');
    }

    const activeRequest = await this.requestRepository.findOne({
      where: {
        patient: { phone: normalizedPhone.value },
        status: In([RequestStatus.NEW, RequestStatus.CONTACTED]),
      },
      relations: ['patient'],
    });

    if (activeRequest) {
      throw new BadRequestException({
        message: 'Patient already has an active request',
        requestId: activeRequest.id,
        status: activeRequest.status,
      });
    }

    return this.patientRepository.manager.transaction(async (manager) => {
      const patientRepository = manager.getRepository(Patient);
      const requestRepository = manager.getRepository(PatientRequest);

      let patient = await patientRepository.findOne({
        where: { phone: normalizedPhone.value },
      });

      if (!patient) {
        patient = await patientRepository.save(
          patientRepository.create({
            name: dto.name,
            phone: normalizedPhone.value,
            avatarColor: getRandomColor(),
          }),
        );
      }

      const request = await requestRepository.save(
        requestRepository.create({
          patientId: patient.id,
          branch: dto.branch,
          arrivalDate,
          departureDate,
          status: RequestStatus.NEW,
        }),
      );

      return {
        success: true,
        externalId: dto.externalId || null,
        patient: {
          id: patient.id,
          name: patient.name,
          phone: patient.phone,
        },
        request: {
          id: request.id,
          status: request.status,
          branch: request.branch,
          arrivalDate: request.arrivalDate,
          departureDate: request.departureDate,
        },
      };
    });
  }

  async softRemoveRequest(id: string) {
    const request = await this.requestRepository.findOne({
      where: { id },
    });

    if (!request) {
      throw new NotFoundException('Arizani (Заявку) topilmadi');
    }

    await this.requestRepository.softRemove(request);

    return {
      message: 'Ariza arxivga olindi (Заявка перенесена в корзину)',
    };
  }

  async softRemovePatient(patientId: string) {
    const patient = await this.patientRepository.findOne({
      where: { id: patientId },
      relations: ['requests'],
    });

    if (!patient) {
      throw new NotFoundException('Bemor topilmadi (Пациент не найден)');
    }

    if (patient.requests && patient.requests.length > 0) {
      await this.requestRepository.softRemove(patient.requests);
    }

    await this.patientRepository.softRemove(patient);

    return {
      message:
        'Bemor va uning arizalari arxivga olindi (Пациент и заявки перенесены в корзину)',
    };
  }

  async restorePatient(patientId: string) {
    await this.patientRepository.restore(patientId);
    await this.requestRepository.restore({ patient: { id: patientId } });

    return { message: 'Bemor tiklandi (Пациент восстановлен)' };
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
