import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  OneToMany,
  Index,
  JoinColumn,
  OneToOne,
} from 'typeorm';
import { EvidenceMessage } from './evidence-message.entity';
import { PatientRequest } from 'src/modules/patients/entities/patient_requests.entity';

@Index('idx_feedbacks_request_id', ['requestId'])
@Entity('feedbacks')
export class Feedback {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'jsonb' })
  ratings: Record<string, number>;

  @Column({ type: 'text', nullable: true })
  comment: string;

  @Column({ type: 'varchar', default: 'complaint' })
  type: 'complaint' | 'suggestion';

  @Column({ type: 'varchar', default: 'other' })
  category: string;

  @Column({ type: 'varchar', default: 'Не указано' })
  subcategory: string;

  @Column({ type: 'int', default: 1 })
  occurrenceNumber: number;

  @Column()
  operatorId: string;

  @OneToOne(() => PatientRequest, (request) => request.feedback, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'requestId' })
  request: PatientRequest;

  @Column()
  requestId: string;

  @Column({ nullable: true })
  trelloUrl: string;

  @OneToMany(() => EvidenceMessage, (msg) => msg.feedback, { cascade: true })
  evidenceMessages: EvidenceMessage[];

  @CreateDateColumn()
  createdAt: Date;
}
