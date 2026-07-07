import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Observable, Subject } from 'rxjs';
import { Repository } from 'typeorm';
import { PatientRequest } from 'src/modules/patients/entities/patient_requests.entity';
import {
  DoctorPatientMessage,
  DoctorPatientMessageStatus,
} from './entities/doctor-patient-message.entity';
import { CreateDoctorMessageDto } from './dto/create-doctor-message.dto';

export interface DoctorMessageEvent {
  type: 'created' | 'done';
  message: DoctorPatientMessage;
}

@Injectable()
export class DoctorMessagesService {
  private readonly events$ = new Subject<DoctorMessageEvent>();

  constructor(
    @InjectRepository(DoctorPatientMessage)
    private readonly messageRepository: Repository<DoctorPatientMessage>,

    @InjectRepository(PatientRequest)
    private readonly requestRepository: Repository<PatientRequest>,
  ) {}

  async create(requestId: string, dto: CreateDoctorMessageDto, senderId: string) {
    const request = await this.requestRepository.findOne({
      where: { id: requestId },
      relations: ['patient'],
    });

    if (!request) {
      throw new NotFoundException('Ariza topilmadi');
    }

    const saved = await this.messageRepository.save(
      this.messageRepository.create({
        requestId,
        senderId,
        message: dto.message.trim(),
        status: DoctorPatientMessageStatus.PENDING,
      }),
    );

    const message = await this.findOne(saved.id);
    this.events$.next({ type: 'created', message });

    return message;
  }

  async findPending() {
    return this.messageRepository.find({
      where: { status: DoctorPatientMessageStatus.PENDING },
      relations: ['request', 'request.patient', 'sender', 'resolvedBy'],
      order: { createdAt: 'ASC' },
    });
  }

  async markDone(id: string, doctorId: string) {
    const current = await this.messageRepository.findOne({
      where: { id },
    });

    if (!current) {
      throw new NotFoundException('Xabar topilmadi');
    }

    if (current.status === DoctorPatientMessageStatus.DONE) {
      return this.findOne(current.id);
    }

    current.status = DoctorPatientMessageStatus.DONE;
    current.resolvedById = doctorId;
    current.doneAt = new Date();

    await this.messageRepository.save(current);

    const message = await this.findOne(current.id);
    this.events$.next({ type: 'done', message });

    return message;
  }

  stream(): Observable<DoctorMessageEvent> {
    return this.events$.asObservable();
  }

  private async findOne(id: string) {
    const message = await this.messageRepository.findOne({
      where: { id },
      relations: ['request', 'request.patient', 'sender', 'resolvedBy'],
    });

    if (!message) {
      throw new NotFoundException('Xabar topilmadi');
    }

    return message;
  }
}
