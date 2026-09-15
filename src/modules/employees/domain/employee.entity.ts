import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToMany,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Article } from '../../articles/domain/article.entity';
import { Case } from '../../cases/domain/case.entity';
import { Media } from '../../media/domain/media.entity';
import { News } from '../../news/domain/news.entity';

@Entity('employees')
export class Employee {
  @PrimaryGeneratedColumn()
  id: number;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 255 })
  slug: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'varchar', length: 255 })
  position: string;

  // Фото — опциональная ссылка на медиатеку, по образцу Article.cover: только relation, без
  // скалярной photo_media_id-колонки (см. комментарий там). Удаление файла не роняет сотрудника.
  @Index()
  @ManyToOne(() => Media, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'photo_media_id' })
  photo: Media | null;

  // короткое описание — карточка «О компании» + подпись под статьёй/кейсом
  @Column({ name: 'short_bio', type: 'text', nullable: true })
  shortBio: string | null;

  // полное био — TipTap JSON, та же схема, что content у статей
  @Column({ type: 'jsonb', nullable: true })
  bio: Record<string, unknown> | null;

  @Column({ name: 'bio_html', type: 'text', nullable: true })
  bioHtml: string | null;

  // стаж, свободная форма («6 лет в digital-маркетинге»)
  @Column({ type: 'text', nullable: true })
  experience: string | null;

  // ссылки на внешние профили (LinkedIn, VK, СМИ)
  @Column({ name: 'same_as', type: 'jsonb', default: () => "'[]'" })
  sameAs: string[];

  // SEO персональной страницы
  @Column({ name: 'meta_title', type: 'varchar', length: 255, nullable: true })
  metaTitle: string | null;

  @Column({ name: 'meta_description', type: 'text', nullable: true })
  metaDescription: string | null;

  // порядок на странице «Команда»
  @Column({ type: 'int', default: 0 })
  priority: number;

  // скрыть уволившегося без удаления записи (не теряем авторство в старых материалах)
  @Column({ name: 'is_visible', type: 'boolean', default: true })
  isVisible: boolean;

  @ManyToMany(() => Article, (article) => article.authors)
  articles: Article[];

  @ManyToMany(() => Case, (caseEntity) => caseEntity.authors)
  cases: Case[];

  @ManyToMany(() => News, (news) => news.authors)
  news: News[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
