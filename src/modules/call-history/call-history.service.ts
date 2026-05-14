import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { CallStatus } from './entities/call-status.entity';
import { AddCallStatusDto } from './dto/add-call-status.dto';
import { PatientRequest } from '../patients/entities/patient_requests.entity';
import { RequestStatus } from 'src/common/enums/request-status.enum';

@Injectable()
export class CallHistoryService {
  constructor(
    @InjectRepository(CallStatus)
    private callRepository: Repository<CallStatus>,
    
    @InjectRepository(PatientRequest)
    private requestRepository: Repository<PatientRequest>,
  ) {}

  async create(requestId: string, dto: AddCallStatusDto, operatorId: string) {
    let record = await this.callRepository.findOne({ where: { requestId } });

    if (record) {
      record.status = dto.status;
      record.note = dto.note as string;
      record.operatorId = operatorId;
    } else {
      record = this.callRepository.create({
        requestId,
        status: dto.status,
        note: dto.note,
        operatorId,
      });
    }

    const savedRecord = await this.callRepository.save(record);

    await this.requestRepository.update(requestId, { status: dto.status });

    return savedRecord;
  }

  async revert(id: string) {
    const record = await this.callRepository.findOne({ where: { id } });
    
    if (!record) {
      throw new NotFoundException(`История звонка с ID ${id} не найдена`);
    }

    await this.requestRepository.update(record.requestId, { 
      status: RequestStatus.NEW 
    });

    await this.callRepository.delete(id);

    return {
      success: true,
      message: 'Звонок успешно отменен, статус заявки возвращен на NEW',
    };
  }

  async findByRequest(requestId: string) {
    return this.callRepository.findOne({
      where: { requestId },
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