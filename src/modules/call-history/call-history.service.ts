import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { CallStatus } from './entities/call-status.entity';
import { AddCallStatusDto } from './dto/add-call-status.dto';

@Injectable()
export class CallHistoryService {
  constructor(
    @InjectRepository(CallStatus)
    private callRepository: Repository<CallStatus>,
  ) {}

  async create(patientId: string, dto: AddCallStatusDto, operatorId: string) {
    const record = this.callRepository.create({
      patientId,
      status: dto.status,
      note: dto.note,
      operatorId,
    });

    return this.callRepository.save(record);
  }

  async findByPatient(patientId: string) {
    return this.callRepository.find({
      where: { patientId },
      order: { createdAt: 'DESC' },
    });
  }

  async getOperatorStats(operatorId: string, startDate: Date, endDate: Date) {
    return this.callRepository.find({
      where: {
        operatorId,
        createdAt: Between(startDate, endDate),
      },
      order: { createdAt: 'DESC' },
    });
  }
}