import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { Patient } from '../../patients/entities/patient.entity';
import { EvidenceMessage } from './evidence-message.entity';

@Entity('feedbacks')
export class Feedback {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'jsonb' })
  ratings: Record<string, number>;

  @Column({ type: 'text', nullable: true })
  comment: string;

  @Column()
  operatorId: string; 

  @ManyToOne(() => Patient, (patient) => patient.feedbacks, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'patientId' })
  patient: Patient;

  @Column()
  patientId: string;

  @OneToMany(() => EvidenceMessage, (msg) => msg.feedback, { cascade: true })
  evidenceMessages: EvidenceMessage[];

  @CreateDateColumn()
  createdAt: Date;
}