import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  ManyToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Article } from '../../articles/domain/article.entity';
import { Case } from '../../cases/domain/case.entity';

@Entity('tags')
export class Tag {
  @PrimaryGeneratedColumn()
  id: number;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 255 })
  slug: string;

  // Имя совпадает с индексом, созданным вручную в AddTagNameUnique (не сгенерировано TypeORM) —
  // без явного имени TypeORM дал бы хешевое, и следующий migration:generate предлагал бы
  // пересоздать индекс (мелочь из round-2 review, §3).
  @Index('IDX_tags_name_unique', { unique: true })
  @Column({ type: 'varchar', length: 100 })
  name: string;

  // порядок тега в списках/фильтре на сайте — не влияет на сортировку статей/кейсов
  @Column({ type: 'int', default: 0 })
  priority: number;

  @ManyToMany(() => Article, (article) => article.tags)
  articles: Article[];

  @ManyToMany(() => Case, (caseEntity) => caseEntity.tags)
  cases: Case[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
