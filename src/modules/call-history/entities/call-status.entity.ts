import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Patient } from '../../patients/entities/patient.entity';
import { PatientStatus } from 'src/common/enums/patient-status.enum';

@Entity('call_statuses')
export class CallStatus {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'enum', enum: PatientStatus })
  status: PatientStatus;

  @Column({ type: 'text', nullable: true })
  note: string;

  @Column() 
  operatorId: string;

  @ManyToOne(() => Patient, (patient) => patient.callHistory, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'patientId' })
  patient: Patient;

  @Column()
  patientId: string;

  @CreateDateColumn()
  createdAt: Date;
}
