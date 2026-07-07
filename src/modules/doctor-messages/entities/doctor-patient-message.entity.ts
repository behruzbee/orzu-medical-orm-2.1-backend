import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { PatientRequest } from 'src/modules/patients/entities/patient_requests.entity';
import { Employee } from 'src/modules/users/entities/employee.entity';

export enum DoctorPatientMessageStatus {
  PENDING = 'pending',
  DONE = 'done',
}

@Entity('doctor_patient_messages')
export class DoctorPatientMessage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text' })
  message: string;

  @Column({
    type: 'enum',
    enum: DoctorPatientMessageStatus,
    default: DoctorPatientMessageStatus.PENDING,
  })
  status: DoctorPatientMessageStatus;

  @Column()
  requestId: string;

  @ManyToOne(() => PatientRequest, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'requestId' })
  request: PatientRequest;

  @Column({ nullable: true })
  senderId?: string | null;

  @ManyToOne(() => Employee, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'senderId' })
  sender?: Employee | null;

  @Column({ nullable: true })
  resolvedById?: string | null;

  @ManyToOne(() => Employee, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'resolvedById' })
  resolvedBy?: Employee | null;

  @Column({ type: 'timestamp', nullable: true })
  doneAt?: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
