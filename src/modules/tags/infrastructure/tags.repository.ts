import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, In, Not, Repository } from 'typeorm';
import { escapeLikePattern } from '../../../core/persistence/escape-like-pattern.util';
import { isEmptyPatch } from '../../../core/persistence/is-empty-patch.util';
import { TagWithCountsRow } from '../dto/tag-with-counts-response.dto';
import { Tag } from '../domain/tag.entity';

interface CreateTagRecord {
  slug: string;
  name: string;
  priority?: number;
}

type UpdateTagRecord = Partial<CreateTagRecord>;

@Injectable()
export class TagsRepository {
  constructor(@InjectRepository(Tag) private readonly repo: Repository<Tag>) {}

  findByIds(ids: number[]): Promise<Tag[]> {
    if (!ids.length) return Promise.resolve([]);
    return this.repo.find({ where: { id: In(ids) }, select: { id: true } });
  }

  findById(id: number): Promise<Tag | null> {
    return this.repo.findOne({ where: { id } });
  }

  // Идемпотентность create по имени (без учёта регистра) — creatable-комбобокс в админке не
  // должен плодить дубли тега с тем же названием. escapeLikePattern обязателен: без него имя со
  // спецсимволом ILIKE ('%'/'_') матчилось бы как wildcard, а не литерал — «Скидка 50%» создания
  // тега возвращал бы чужой существующий тег «Скидка 50...» вместо создания нового (N4, round-2
  // review). Старый бек сравнивал точным LOWER(name) = LOWER(:name), не ILIKE — этот вариант
  // сохраняет текущее поведение (частичное совпадение регистронезависимо не нужно, только защита).
  findByNameCI(name: string): Promise<Tag | null> {
    return this.repo.findOne({
      where: { name: ILike(escapeLikePattern(name)) },
    });
  }

  existsBySlug(slug: string, excludeId?: number): Promise<boolean> {
    return this.repo.exists({
      where: excludeId !== undefined ? { slug, id: Not(excludeId) } : { slug },
    });
  }

  create(data: CreateTagRecord): Promise<Tag> {
    return this.repo.save(this.repo.create(data));
  }

  async update(id: number, patch: UpdateTagRecord): Promise<Tag | null> {
    if (!isEmptyPatch(patch)) {
      await this.repo.update(id, patch);
    }
    return this.findById(id);
  }

  async remove(id: number): Promise<void> {
    await this.repo.delete(id);
  }

  // Админ-таблица — тегов мало, список без пагинации, с количеством привязанных статей/кейсов.
  async findAllWithCounts(): Promise<TagWithCountsRow[]> {
    const rows = await this.repo
      .createQueryBuilder('tag')
      .leftJoin('article_tags', 'at', 'at.tag_id = tag.id')
      .leftJoin('case_tags', 'ct', 'ct.tag_id = tag.id')
      .select([
        'tag.id AS id',
        'tag.slug AS slug',
        'tag.name AS name',
        'tag.priority AS priority',
      ])
      .addSelect('COUNT(DISTINCT at.article_id)', 'articlesCount')
      .addSelect('COUNT(DISTINCT ct.case_id)', 'casesCount')
      .groupBy('tag.id')
      .orderBy('tag.name', 'ASC')
      .getRawMany<{
        id: number;
        slug: string;
        name: string;
        priority: number;
        articlesCount: string;
        casesCount: string;
      }>();

    return rows.map((row) => ({
      id: row.id,
      slug: row.slug,
      name: row.name,
      priority: row.priority,
      articlesCount: Number(row.articlesCount),
      casesCount: Number(row.casesCount),
    }));
  }

  // Публичный список для фильтра на сайте — только теги, реально использованные в опубликованном
  // контенте. `type` сужает до одного источника (статьи/кейсы), без него — объединение обоих.
  findPublicList(type?: 'article' | 'case'): Promise<Tag[]> {
    const qb = this.repo.createQueryBuilder('tag');

    const articleIdsSubquery = qb
      .subQuery()
      .select('at.tag_id')
      .from('article_tags', 'at')
      .innerJoin('articles', 'a', 'a.id = at.article_id')
      .where('a.date_published IS NOT NULL')
      .andWhere('a.date_published <= :now')
      .getQuery();

    const caseIdsSubquery = qb
      .subQuery()
      .select('ct.tag_id')
      .from('case_tags', 'ct')
      .innerJoin('cases', 'c', 'c.id = ct.case_id')
      .where('c.date_published IS NOT NULL')
      .andWhere('c.date_published <= :now')
      .getQuery();

    const usedTagIdsSubquery =
      type === 'article'
        ? articleIdsSubquery
        : type === 'case'
          ? caseIdsSubquery
          : `${articleIdsSubquery} UNION ${caseIdsSubquery}`;

    return qb
      .where(`tag.id IN (${usedTagIdsSubquery})`)
      .setParameter('now', new Date())
      .orderBy('tag.priority', 'DESC')
      .addOrderBy('tag.name', 'ASC')
      .getMany();
  }
}
