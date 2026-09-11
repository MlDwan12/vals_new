import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, In, Not, Repository } from 'typeorm';
import { assertRawRowShape } from '../../../core/persistence/assert-raw-row-shape.util';
import { escapeLikePattern } from '../../../core/persistence/escape-like-pattern.util';
import { isEmptyPatch } from '../../../core/persistence/is-empty-patch.util';
import { TagContentType } from '../dto/tag-public-list-query.dto';
import { TagWithCountsRow } from '../dto/tag-with-counts-response.dto';
import { Tag } from '../domain/tag.entity';

interface CreateTagRecord {
  slug: string;
  name: string;
  priority?: number;
}

type UpdateTagRecord = Partial<CreateTagRecord>;

interface TagSource {
  // Таблица связи «материал ↔ тег» и её алиас в подзапросе (алиасы обязаны различаться: все
  // источники склеиваются одним UNION).
  joinTable: string;
  joinAlias: string;
  // Колонка связи, указывающая на материал.
  foreignKey: string;
  // Таблица материалов — из неё берётся date_published.
  table: string;
  tableAlias: string;
}

// Где живут теги каждого типа контента. Все три устроены одинаково: <тип>_tags(tag_id, <тип>_id)
// плюс таблица материалов с date_published.
const TAG_SOURCES: Record<TagContentType, TagSource> = {
  article: {
    joinTable: 'article_tags',
    joinAlias: 'at',
    foreignKey: 'article_id',
    table: 'articles',
    tableAlias: 'a',
  },
  case: {
    joinTable: 'case_tags',
    joinAlias: 'ct',
    foreignKey: 'case_id',
    table: 'cases',
    tableAlias: 'c',
  },
  news: {
    joinTable: 'news_tags',
    joinAlias: 'nt',
    foreignKey: 'news_id',
    table: 'news',
    tableAlias: 'n',
  },
};

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

  // Админ-таблица — тегов мало, список без пагинации, с количеством привязанных материалов.
  // Новости считаются наравне со статьями и кейсами: без этого тег, использованный только в
  // новостях, выглядел бы в таблице как ничей (0/0), хотя удалить его база не даст.
  async findAllWithCounts(): Promise<TagWithCountsRow[]> {
    const rows = await this.repo
      .createQueryBuilder('tag')
      .leftJoin('article_tags', 'at', 'at.tag_id = tag.id')
      .leftJoin('case_tags', 'ct', 'ct.tag_id = tag.id')
      .leftJoin('news_tags', 'nt', 'nt.tag_id = tag.id')
      .select([
        'tag.id AS id',
        'tag.slug AS slug',
        'tag.name AS name',
        'tag.priority AS priority',
      ])
      .addSelect('COUNT(DISTINCT at.article_id)', 'articlesCount')
      .addSelect('COUNT(DISTINCT ct.case_id)', 'casesCount')
      .addSelect('COUNT(DISTINCT nt.news_id)', 'newsCount')
      .groupBy('tag.id')
      .orderBy('tag.name', 'ASC')
      .getRawMany<{
        id: number;
        slug: string;
        name: string;
        priority: number;
        articlesCount: string;
        casesCount: string;
        newsCount: string;
      }>();

    rows.forEach((row) =>
      assertRawRowShape(
        row,
        { id: 'number', slug: 'string', name: 'string', priority: 'number' },
        'findAllWithCounts',
      ),
    );

    return rows.map((row) => ({
      id: row.id,
      slug: row.slug,
      name: row.name,
      priority: row.priority,
      articlesCount: Number(row.articlesCount),
      casesCount: Number(row.casesCount),
      newsCount: Number(row.newsCount),
    }));
  }

  // Публичный список для фильтра на сайте — только теги, реально использованные в опубликованном
  // контенте. `type` сужает до одного источника, без него — объединение всех.
  findPublicList(type?: TagContentType): Promise<Tag[]> {
    const qb = this.repo.createQueryBuilder('tag');

    // Подзапрос «tag_id, встречающиеся у опубликованных материалов этого типа». Все три таблицы
    // связей устроены одинаково, поэтому параметризуем: третья копия того же SQL и тернарник на
    // три ветки вместо двух — это ровно то место, где следующий тип контента (лендинги, срез F)
    // снова потребует правки в двух местах.
    const publishedTagIds = (source: TagSource) =>
      qb
        .subQuery()
        .select(`${source.joinAlias}.tag_id`)
        .from(source.joinTable, source.joinAlias)
        .innerJoin(
          source.table,
          source.tableAlias,
          `${source.tableAlias}.id = ${source.joinAlias}.${source.foreignKey}`,
        )
        .where(`${source.tableAlias}.date_published IS NOT NULL`)
        .andWhere(`${source.tableAlias}.date_published <= :now`)
        .getQuery();

    const sources = type ? [TAG_SOURCES[type]] : Object.values(TAG_SOURCES);
    const usedTagIdsSubquery = sources.map(publishedTagIds).join(' UNION ');

    return qb
      .where(`tag.id IN (${usedTagIdsSubquery})`)
      .setParameter('now', new Date())
      .orderBy('tag.priority', 'DESC')
      .addOrderBy('tag.name', 'ASC')
      .getMany();
  }
}
