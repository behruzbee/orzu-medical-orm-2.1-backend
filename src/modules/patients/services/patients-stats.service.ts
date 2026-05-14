import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, In, Not } from 'typeorm';
import { RequestStatus } from 'src/common/enums/request-status.enum'; // Исправлено на RequestStatus
import { PatientRequest } from '../entities/patient_requests.entity'; // Используем PatientRequest вместо Patient

@Injectable()
export class PatientsStatsService {
  constructor(
    @InjectRepository(PatientRequest) 
    private requestRepo: Repository<PatientRequest> // Меняем репозиторий
  ) {}

  async getStats() {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const totalTasks = await this.requestRepo.count({
      where: {
        status: In([RequestStatus.NEW, RequestStatus.CONTACTED]),
      },
    });

    const newTasks = await this.requestRepo.count({
      where: {
        createdAt: Between(todayStart, todayEnd),
        status: In([RequestStatus.NEW, RequestStatus.CONTACTED]),
      },
    });

    const callBackTasks = await this.requestRepo.count({
      where: {
        status: RequestStatus.CONTACTED,
        updatedAt: Between(todayStart, todayEnd),
      },
    });

    const completedTasks = await this.requestRepo.count({
      where: {
        status: Not(In([RequestStatus.NEW, RequestStatus.CONTACTED])),
        updatedAt: Between(todayStart, todayEnd),
      },
    });

    return {
      totalTasks,
      newTasks,
      callBackTasks,
      completedTasks,
    };
  }
}