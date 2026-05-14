import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  OneToOne,
  JoinColumn,
} from 'typeorm';
import { RequestStatus } from 'src/common/enums/request-status.enum';
import { PatientRequest } from 'src/modules/patients/entities/patient_requests.entity';

@Entity('call_statuses')
export class CallStatus {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'enum', enum: RequestStatus })
  status: RequestStatus;

  @Column({ type: 'text', nullable: true })
  note: string;

  @Column()
  operatorId: string;

  @OneToOne(() => PatientRequest, (request) => request.callStatus, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'requestId' })
  request: PatientRequest;

  @Column()
  requestId: string;

  @CreateDateColumn()
  createdAt: Date;
}
