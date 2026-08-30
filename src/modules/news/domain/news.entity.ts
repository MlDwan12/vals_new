import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  JoinTable,
  ManyToMany,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Employee } from '../../employees/domain/employee.entity';
import { Media } from '../../media/domain/media.entity';
import { Tag } from '../../tags/domain/tag.entity';

@Entity('news')
export class News {
  @PrimaryGeneratedColumn()
  id: number;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 255 })
  slug: string;

  @Column({ type: 'varchar', length: 255 })
  title: string;

  // Короткий анонс для карточки — у статей эту роль играет description (EXPANSION_TASKS.md §3).
  @Column({ type: 'text', nullable: true })
  announce: string | null;

  // Основной контент новости (TipTap JSON)
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

  // Обложка — опциональная ссылка на медиатеку. Без отдельной скалярной cover_media_id-колонки —
  // по образцу Article.cover/Case.cover (см. их entity, задача 4 — дублирующая колонка рядом с
  // relation на ту же FK была источником TypeORM-ловушки при save()).
  @Index()
  @ManyToOne(() => Media, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'cover_media_id' })
  cover: Media | null;

  // Авторы (many-to-many, задел на соавторов — сейчас на практике один автор), тот же паттерн, что
  // у статей/кейсов.
  @ManyToMany(() => Employee, (employee) => employee.news, {
    onDelete: 'CASCADE',
  })
  @JoinTable({
    name: 'news_authors',
    joinColumn: { name: 'news_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'employee_id', referencedColumnName: 'id' },
  })
  authors: Employee[];

  // Теги — общий справочник со статьями и кейсами
  @ManyToMany(() => Tag, (tag) => tag.news, {
    onDelete: 'CASCADE',
  })
  @JoinTable({
    name: 'news_tags',
    joinColumn: { name: 'news_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'tag_id', referencedColumnName: 'id' },
  })
  tags: Tag[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
