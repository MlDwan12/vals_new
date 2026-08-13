import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToMany,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Case } from '../../cases/domain/case.entity';
import { Tariff } from '../../tariffs/domain/tariff.entity';
import { ServiceBackgroundColor } from '../enums/service-background-color.enum';
import { ServiceCategory } from './service-category.entity';
import { ServiceFaq } from './service-faq.entity';
import { ServiceStep } from './service-step.entity';

@Entity('services')
export class Service {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', unique: true })
  slug: string;

  @ManyToOne(() => ServiceCategory, (category) => category.services, {
    nullable: false,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'category_id' })
  category: ServiceCategory;

  // Заголовок для карточки
  @Column({ type: 'text' })
  title: string;

  @Column({ type: 'text', nullable: true })
  subtitle: string | null;

  // Полное описание
  @Column({ type: 'text' })
  description: string;

  @Column({ name: 'sub_description', type: 'text' })
  subDescription: string;

  // Короткий список для карточек (3 пункта)
  @Column({ type: 'text', array: true, nullable: true })
  list: string[] | null;

  @Column({ type: 'varchar', length: 64 })
  icon: string;

  @Column({
    name: 'background_color',
    type: 'enum',
    enum: ServiceBackgroundColor,
    default: ServiceBackgroundColor.WHITE,
  })
  backgroundColor: ServiceBackgroundColor;

  @OneToMany(() => ServiceStep, (step) => step.service)
  steps: ServiceStep[];

  @OneToMany(() => Tariff, (tariff) => tariff.service)
  tariffs: Tariff[];

  // onDelete на этой (не владеющей) стороне тоже обязателен: TypeORM берёт onDelete инверсной
  // FK-колонки (service_id) join-таблицы отсюда, а не с владеющей стороны (Case.services) —
  // без этого service_id получает ON DELETE NO ACTION, а case_id — CASCADE (несимметрично).
  @ManyToMany(() => Case, (caseEntity) => caseEntity.services, {
    onDelete: 'CASCADE',
  })
  cases: Case[];

  @OneToMany(() => ServiceFaq, (faq) => faq.service)
  faq: ServiceFaq[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
