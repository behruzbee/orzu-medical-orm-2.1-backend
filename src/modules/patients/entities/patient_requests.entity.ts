import { RequestStatus } from 'src/common/enums/request-status.enum';
import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  OneToOne,
  PrimaryGeneratedColumn,
  JoinColumn,
  UpdateDateColumn,
  DeleteDateColumn,
} from 'typeorm';
import { Patient } from './patient.entity';
import { CallStatus } from 'src/modules/call-history/entities/call-status.entity';
import { Feedback } from 'src/modules/feedbacks/entities/feedback.entity'; // Пример пути

@Entity('patient_requests')
export class PatientRequest {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    type: 'enum',
    enum: RequestStatus,
    default: RequestStatus.NEW,
  })
  status: RequestStatus;

  @Column()
  branch: string;

  @Column({ type: 'timestamp' })
  departureDate: Date;

  @Column({ type: 'timestamp' })
  arrivalDate: Date;

  @ManyToOne(() => Patient, (patient) => patient.requests, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'patientId' })
  patient: Patient;

  @Column()
  patientId: string;

  @OneToOne(() => CallStatus, (call) => call.request)
  callStatus: CallStatus;

  @OneToOne(() => Feedback, (feedback) => feedback.request)
  feedback: Feedback;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @DeleteDateColumn()
  deletedAt?: Date;
}
