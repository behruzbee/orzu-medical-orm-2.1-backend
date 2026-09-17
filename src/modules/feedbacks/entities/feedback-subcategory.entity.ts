import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Index(
  'uq_feedback_subcategories_type_category_name',
  ['type', 'category', 'normalizedName'],
  { unique: true },
)
@Entity('feedback_subcategories')
export class FeedbackSubcategory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  type: 'complaint' | 'suggestion';

  @Column({ type: 'varchar' })
  category: string;

  @Column({ type: 'varchar' })
  name: string;

  @Column({ type: 'varchar' })
  normalizedName: string;

  @Column({ type: 'boolean', default: false })
  isCustom: boolean;

  @CreateDateColumn()
  createdAt: Date;
}
