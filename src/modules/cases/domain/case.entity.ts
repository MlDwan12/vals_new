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
import { Employee } from '../../employees/domain/employee.entity';
import { Landing } from '../../landings/domain/landing.entity';
import { Media } from '../../media/domain/media.entity';
import { Service } from '../../services/domain/service.entity';
import { Tag } from '../../tags/domain/tag.entity';
import { CaseFaq } from './case-faq.entity';

@Entity('cases')
export class Case {
  @PrimaryGeneratedColumn()
  id: number;

  // Связь с услугами (M2M) — join-таблица `service_to_case`. Эта (владеющая) сторона — CASCADE:
  // удаление кейса чистит связь без вопросов. Обратная сторона (Service.cases) — RESTRICT, не
  // CASCADE (security-audit-2026-08-31.md №4) — удаление услуги, ещё используемой в кейсе,
  // блокируется явной 409 в ServicesService.remove(), не обнуляет Case.services молча.
  @ManyToMany(() => Service, (service) => service.cases, {
    onDelete: 'CASCADE',
  })
  @JoinTable({
    name: 'service_to_case',
    joinColumn: { name: 'case_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'service_id', referencedColumnName: 'id' },
  })
  services: Service[];

  // Отрасль: JSON-массив строк, например ["IT", "FinTech", "E-commerce"].
  // Не связано с таблицей industries (независимый механизм, преднамеренно не трогаем на этом этапе).
  @Column({ type: 'jsonb', default: () => "'[]'" })
  industry: string[];

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 255 })
  slug: string;

  @Column({ type: 'varchar', length: 255 })
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'text' })
  problem: string;

  @Column({ type: 'text' })
  result: string;

  @Column({ type: 'jsonb', nullable: true })
  content: Record<string, unknown> | null;

  @Column({ name: 'content_html', type: 'text', nullable: true })
  contentHtml: string | null;

  // SEO
  @Column({ name: 'meta_title', type: 'varchar', length: 255, nullable: true })
  metaTitle: string | null;

  @Column({
    name: 'meta_description',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  metaDescription: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  keywords: string | null;

  @Index()
  @Column({ name: 'date_published', type: 'timestamptz', nullable: true })
  datePublished: Date | null;

  @Index()
  @Column({ type: 'int', default: 0 })
  priority: number;

  @Column({ name: 'has_toc', type: 'boolean', default: false })
  hasToc: boolean;

  // Обложка — опциональная ссылка на медиатеку. Удаление файла не должно ронять кейс — SET NULL.
  // Без отдельной скалярной cover_media_id-колонки — см. article.entity.ts, тот же приём и причина.
  @Index()
  @ManyToOne(() => Media, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'cover_media_id' })
  cover: Media | null;

  // Авторы (many-to-many, задел на соавторов — сейчас на практике один автор)
  @ManyToMany(() => Employee, (employee) => employee.cases, {
    onDelete: 'CASCADE',
  })
  @JoinTable({
    name: 'case_authors',
    joinColumn: { name: 'case_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'employee_id', referencedColumnName: 'id' },
  })
  authors: Employee[];

  // Теги — many-to-many, общий справочник со статьями и кейсами
  @ManyToMany(() => Tag, (tag) => tag.cases, {
    onDelete: 'CASCADE',
  })
  @JoinTable({
    name: 'case_tags',
    joinColumn: { name: 'case_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'tag_id', referencedColumnName: 'id' },
  })
  tags: Tag[];

  // FAQ кейса — структурированные данные для FAQPage JSON-LD
  @OneToMany(() => CaseFaq, (faq) => faq.case)
  faq: CaseFaq[];

  // Обратная сторона Landing.cases (EXPANSION_TASKS.md §10) — onDelete здесь тоже обязателен, а не
  // только на владеющей стороне: TypeORM берёт onDelete инверсной FK-колонки (case_id) join-таблицы
  // отсюда, не с Landing.cases (тот же приём и причина, что у Service.cases выше).
  @ManyToMany(() => Landing, (landing) => landing.cases, {
    onDelete: 'CASCADE',
  })
  landings: Landing[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
