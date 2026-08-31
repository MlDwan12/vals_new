import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  JoinTable,
  ManyToMany,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Case } from '../../cases/domain/case.entity';
import { Industry } from '../../industries/domain/industry.entity';
import { Media } from '../../media/domain/media.entity';
import { Service } from '../../services/domain/service.entity';
import { LandingFaq } from './landing-faq.entity';

@Entity('landings')
@Index(['service', 'slug'], { unique: true })
export class Landing {
  @PrimaryGeneratedColumn()
  id: number;

  // RESTRICT, не CASCADE/SET NULL — удаление услуги с живыми нишевыми страницами не должно ни
  // унести их с собой, ни молча оставить страницу без раздела (§10.1 expansion-decisions.md).
  // slug уникален только в пределах услуги (составной индекс выше), не глобально — URL вложенный
  // (/services/{услуга}/{ниша}), общий фрагмент под разными услугами — не коллизия (§10.2).
  @ManyToOne(() => Service, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'service_id' })
  service: Service;

  @ManyToOne(() => Industry, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'industry_id' })
  @Index()
  industry: Industry;

  @Column({ type: 'varchar', length: 255 })
  slug: string;

  @Column({ type: 'varchar', length: 255 })
  title: string;

  @Column({ type: 'varchar', length: 255 })
  h1: string;

  @Column({ type: 'text', nullable: true })
  subtitle: string | null;

  // Основной контент страницы (TipTap JSON) — тот же паттерн, что у articles/cases/news.
  @Column({ type: 'jsonb' })
  content: Record<string, unknown>;

  @Column({ name: 'content_html', type: 'text', nullable: true })
  contentHtml: string | null;

  @Column({ name: 'meta_title', type: 'varchar', length: 255, nullable: true })
  metaTitle: string | null;

  @Column({ name: 'meta_description', type: 'text', nullable: true })
  metaDescription: string | null;

  @Column({ type: 'text', nullable: true })
  keywords: string | null;

  // Преимущества — список пунктов (ТЗ §10), тот же тип, что Service.list.
  @Column({ type: 'text', array: true, nullable: true })
  advantages: string[] | null;

  // CTA-блок — три плоские колонки, не jsonb (по образцу остального проекта: фиксированная форма
  // хранится типизированными колонками, jsonb — только для действительно произвольных данных).
  @Column({ name: 'cta_title', type: 'text', nullable: true })
  ctaTitle: string | null;

  @Column({ name: 'cta_subtitle', type: 'text', nullable: true })
  ctaSubtitle: string | null;

  @Column({ name: 'cta_button_text', type: 'text', nullable: true })
  ctaButtonText: string | null;

  // Обложка — та же схема, что Article.cover (только relation, без отдельной скалярной
  // cover_media_id-колонки — см. комментарий там же про TypeORM-ловушку).
  @Index()
  @ManyToOne(() => Media, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'cover_media_id' })
  cover: Media | null;

  @Index()
  @Column({ name: 'is_published', type: 'boolean', default: false })
  isPublished: boolean;

  @Index()
  @Column({ type: 'int', default: 0 })
  priority: number;

  // Связанные кейсы — опционально, без порядка (задача не запрашивает сортировку, в отличие от
  // задачи 9 про связанные услуги).
  @ManyToMany(() => Case, (caseEntity) => caseEntity.landings, {
    onDelete: 'CASCADE',
  })
  @JoinTable({
    name: 'landing_cases',
    joinColumn: { name: 'landing_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'case_id', referencedColumnName: 'id' },
  })
  cases: Case[];

  @OneToMany(() => LandingFaq, (faq) => faq.landing)
  faq: LandingFaq[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
