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
import { Media } from '../../media/domain/media.entity';
import { Tag } from '../../tags/domain/tag.entity';
import { ArticleFaq } from './article-faq.entity';

@Entity('articles')
export class Article {
  @PrimaryGeneratedColumn()
  id: number;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 255 })
  slug: string;

  @Column({ type: 'varchar', length: 255 })
  title: string;

  // описание для карточки
  @Column({ type: 'text', nullable: true })
  description: string | null;

  // основной контент статьи (TipTap JSON)
  @Column({ type: 'jsonb' })
  content: Record<string, unknown>;

  @Column({ name: 'content_html', type: 'text', nullable: true })
  contentHtml: string | null;

  // SEO
  @Column({ name: 'meta_title', type: 'varchar', length: 255, nullable: true })
  metaTitle: string | null;

  @Column({ name: 'meta_description', type: 'text', nullable: true })
  metaDescription: string | null;

  @Column({ type: 'text', nullable: true })
  keywords: string | null;

  @Index()
  @Column({ name: 'date_published', type: 'timestamptz', nullable: true })
  datePublished: Date | null;

  @Index()
  @Column({ type: 'int', default: 0 })
  priority: number;

  // Время чтения в минутах — указывается вручную в админке, не вычисляется
  @Column({ name: 'reading_time', type: 'int', nullable: true })
  readingTime: number | null;

  // Показывать автособираемое оглавление по заголовкам H1-H3 на странице статьи
  @Column({ name: 'has_toc', type: 'boolean', default: false })
  hasToc: boolean;

  // Обложка — опциональная ссылка на медиатеку. Удаление файла не должно ронять статью — SET NULL.
  // Без отдельной скалярной cover_media_id-колонки (только relation) — по образцу Service.category:
  // дублирующая колонка рядом с relation на ту же FK — источник TypeORM-ловушки (save() при
  // одновременно загруженной stale-relation и напрямую выставленном скаляре молча предпочитает
  // relation), устранена на уровне схемы, а не обходом в сервисе (altitude review, /simplify).
  @Index()
  @ManyToOne(() => Media, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'cover_media_id' })
  cover: Media | null;

  // Авторы (many-to-many, задел на соавторов — сейчас на практике один автор)
  @ManyToMany(() => Employee, (employee) => employee.articles, {
    onDelete: 'CASCADE',
  })
  @JoinTable({
    name: 'article_authors',
    joinColumn: { name: 'article_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'employee_id', referencedColumnName: 'id' },
  })
  authors: Employee[];

  // Теги — many-to-many, общий справочник со статьями и кейсами
  @ManyToMany(() => Tag, (tag) => tag.articles, {
    onDelete: 'CASCADE',
  })
  @JoinTable({
    name: 'article_tags',
    joinColumn: { name: 'article_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'tag_id', referencedColumnName: 'id' },
  })
  tags: Tag[];

  // FAQ статьи — структурированные данные для FAQPage JSON-LD
  @OneToMany(() => ArticleFaq, (faq) => faq.article)
  faq: ArticleFaq[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
