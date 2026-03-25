import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { CallStatus } from '../../call-history/entities/call-status.entity';
import { Feedback } from '../../feedbacks/entities/feedback.entity';
import { PatientStatus } from 'src/common/enums/patient-status.enum';

@Entity('patients')
export class Patient {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ unique: true })
  phone: string;

  @Column()
  branch: string;

  @Column({ type: 'timestamp' })
  departureDate: Date;

  @Column({ type: 'timestamp' })
  arrivalDate: Date;

  @Column({
    type: 'enum',
    enum: PatientStatus,
    default: PatientStatus.NEW,
  })
  status: PatientStatus;

  @Column({ length: 7 })
  avatarColor: string;

  @OneToMany(() => CallStatus, (call) => call.patient)
  callHistory: CallStatus[];

  @OneToMany(() => Feedback, (feedback) => feedback.patient)
  feedbacks: Feedback[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
