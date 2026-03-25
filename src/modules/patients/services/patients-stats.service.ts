import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, In, Not } from 'typeorm';
import { PatientStatus } from 'src/common/enums/patient-status.enum';
import { Patient } from '../entities/patient.entity';

@Injectable()
export class PatientsStatsService {
  constructor(
    @InjectRepository(Patient) 
    private patientRepo: Repository<Patient>
  ) {}

  async getStats() {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const totalTasks = await this.patientRepo.count({
      where: {
        status: In([PatientStatus.NEW, PatientStatus.CONTACTED]),
      },
    });

    const newTasks = await this.patientRepo.count({
      where: {
        createdAt: Between(todayStart, todayEnd),
        status: In([PatientStatus.NEW, PatientStatus.CONTACTED]),
      },
    });

    const callBackTasks = await this.patientRepo.count({
      where: {
        status: PatientStatus.CONTACTED,
        updatedAt: Between(todayStart, todayEnd),
      },
    });

    const completedTasks = await this.patientRepo.count({
      where: {
        status: Not(In([PatientStatus.NEW, PatientStatus.CONTACTED])),
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