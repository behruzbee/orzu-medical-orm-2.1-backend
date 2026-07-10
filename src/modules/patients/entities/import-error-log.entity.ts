import {
  Entity,
  Index,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
} from 'typeorm';

@Index('idx_import_error_logs_arrival_category_branch', [
  'arrivalDate',
  'category',
  'branch',
])
@Entity('import_error_logs')
export class ImportErrorLog {
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

  @Column({ type: 'timestamp' })
  arrivalDate: Date;

  @Column({ type: 'timestamp' })
  departureDate: Date;

  @Column()
  category: string;

  @Column({ type: 'jsonb' })
  errorMessages: string[];

  @CreateDateColumn()
  createdAt: Date;
}
