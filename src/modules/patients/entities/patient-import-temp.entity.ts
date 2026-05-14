import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn } from 'typeorm';

@Entity('patient_import_temp')
export class PatientImportTemp {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  sessionId: string; 

  @Column()
  lineNumber: number; 

  @Column({ nullable: true })
  name: string;

  @Column({ nullable: true })
  phone: string;

  @Column({ nullable: true })
  branch: string;

  @Column({ type: 'timestamp', nullable: true })
  arrivalDate: Date;

  @Column({ type: 'timestamp', nullable: true })
  departureDate: Date;

  @Column({ default: false })
  hasErrors: boolean;

  @Column({ type: 'jsonb', nullable: true })
  errorDetails: string[]; 

  @CreateDateColumn()
  createdAt: Date;
}