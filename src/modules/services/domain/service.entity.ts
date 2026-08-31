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
import { ServiceRelation } from './service-relation.entity';
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

  // Мета-поля — EXPANSION_TASKS.md задача 9: сейчас страница услуги собирается из
  // front/src/views/service/config/servicesRegistry.ts (*.seo.ts), мета там не редактируема из
  // панели. Nullable — у 18 существующих услуг это поле пока пустое (перенос текстов без потерь
  // требует доступа к front, заблокирован — см. expansion-decisions.md), заполняется контент-
  // менеджером по мере переноса, не разовым бэкафиллом.
  @Column({ name: 'meta_title', type: 'varchar', length: 255, nullable: true })
  metaTitle: string | null;

  @Column({ name: 'meta_description', type: 'text', nullable: true })
  metaDescription: string | null;

  @Column({ type: 'text', nullable: true })
  keywords: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  h1: string | null;

  @OneToMany(() => ServiceStep, (step) => step.service)
  steps: ServiceStep[];

  // Связанные услуги ("смотрите также") — не M2M: нужен порядок, конструкция без него не может его
  // нести (§9 expansion-decisions.md). Однонаправленно: список услуги A не совпадает автоматически
  // со списком услуги B — это редакторский выбор, не симметричное отношение.
  @OneToMany(() => ServiceRelation, (relation) => relation.service)
  relatedServices: ServiceRelation[];

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
