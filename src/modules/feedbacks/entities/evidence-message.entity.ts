import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Feedback } from './feedback.entity';

export enum EvidenceType {
  TEXT = 'text',
  AUDIO = 'audio',
  VIDEO = 'video',
  IMAGE = 'image',
  DOCUMENT = 'document',
}

export enum EvidenceSource {
  WHATSAPP = 'whatsapp',
  MANUAL = 'manual',
}

@Entity('evidence_messages')
export class EvidenceMessage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'enum', enum: EvidenceType })
  type: EvidenceType;

  @Column({ type: 'text', nullable: true })
  text: string;

  @Column({ nullable: true })
  mediaUrl: string;

  @Column({ type: 'bytea', nullable: true, select: false })
  mediaData: Buffer; 

  @Column({ nullable: true })
  mimeType: string;

  @Column({ nullable: true })
  duration: string;

  @Column({ type: 'enum', enum: EvidenceSource, default: EvidenceSource.MANUAL })
  source: EvidenceSource;

  @Column({ default: 'patient' })
  sender: 'operator' | 'patient';

  @Column({ nullable: true })
  originalTimestamp: string;

  @ManyToOne(() => Feedback, (feedback) => feedback.evidenceMessages, { 
    onDelete: 'CASCADE', 
  })
  @JoinColumn({ name: 'feedbackId' })
  feedback: Feedback;

  @Column()
  feedbackId: string;
}