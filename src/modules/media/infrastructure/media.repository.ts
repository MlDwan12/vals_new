import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  buildPaginatedResult,
  PaginatedResult,
} from '../../../core/pagination/paginated-result.interface';
import { escapeLikePattern } from '../../../core/persistence/escape-like-pattern.util';
import { MediaListQueryDto } from '../dto/media-list-query.dto';
// MediaCoverUsage — форма строки результата, определена в dto/ (см. media-remove-response.dto.ts) —
// тот же приём, что TagWithCountsRow в tags.repository.ts (репозиторий соответствует форме, заданной
// в dto/, а не наоборот).
import { MediaCoverUsage } from '../dto/media-remove-response.dto';
import { Media } from '../domain/media.entity';
// Только класс-ссылка для manager.find() внутри транзакции removeWithCoverUsage — не отдельный
// @InjectRepository, поэтому не требует регистрации Article/Case/News в MediaModule (EntityManager
// знает обо всех сущностях DataSource глобально, независимо от forFeature конкретного модуля).
import { Article } from '../../articles/domain/article.entity';
import { Case } from '../../cases/domain/case.entity';
import { Landing } from '../../landings/domain/landing.entity';
import { News } from '../../news/domain/news.entity';

interface CreateMediaRecord {
  name: string;
  fileName: string;
  alt: string | null;
  width: number | null;
  height: number | null;
  mimeType: string | null;
  sizeBytes: number | null;
}

@Injectable()
export class MediaRepository {
  constructor(
    @InjectRepository(Media) private readonly repo: Repository<Media>,
  ) {}

  async findAndCount(
    query: MediaListQueryDto,
  ): Promise<PaginatedResult<Media>> {
    const qb = this.repo
      .createQueryBuilder('media')
      .orderBy('media.createdAt', 'DESC')
      .addOrderBy('media.id', 'DESC')
      .skip((query.page - 1) * query.limit)
      .take(query.limit);

    if (query.search) {
      qb.andWhere('media.name ILIKE :search', {
        search: `%${escapeLikePattern(query.search)}%`,
      });
    }

    const [items, total] = await qb.getManyAndCount();
    return buildPaginatedResult(items, total, query.page, query.limit);
  }

  create(records: CreateMediaRecord[]): Promise<Media[]> {
    return this.repo.save(this.repo.create(records));
  }

  findById(id: number): Promise<Media | null> {
    return this.repo.findOne({ where: { id } });
  }

  // Удаление и подсчёт использования — в одной транзакции с блокировкой строки media (SELECT ...
  // FOR UPDATE), не двумя независимыми запросами до/после delete (code-review high, N-1): без
  // блокировки конкурентный PATCH .../articles/:id {coverMediaId} мог успеть привязать статью к
  // этому файлу уже ПОСЛЕ прочтения списка использования, но ДО удаления — тогда FK (SET NULL,
  // см. EXPANSION_TASKS.md §4.2) молча обнулял бы обложку у статьи, отсутствующей в ответе-
  // предупреждении. FOR UPDATE блокирует такую конкурентную запись до коммита нашей транзакции —
  // список использования, прочитанный после блокировки, гарантированно полон на момент удаления.
  async removeWithCoverUsage(
    id: number,
  ): Promise<{ media: Media | null; usedIn: MediaCoverUsage[] }> {
    return this.repo.manager.transaction(async (manager) => {
      const media = await manager.findOne(Media, {
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!media) {
        return { media: null, usedIn: [] };
      }

      const toUsage = (
        type: MediaCoverUsage['type'],
        rows: { id: number; title: string }[],
      ): MediaCoverUsage[] =>
        rows.map((row) => ({ type, id: row.id, title: row.title }));

      const [articleRows, caseRows, newsRows, landingRows] = await Promise.all([
        manager.find(Article, {
          where: { cover: { id } },
          select: { id: true, title: true },
        }),
        manager.find(Case, {
          where: { cover: { id } },
          select: { id: true, title: true },
        }),
        manager.find(News, {
          where: { cover: { id } },
          select: { id: true, title: true },
        }),
        manager.find(Landing, {
          where: { cover: { id } },
          select: { id: true, title: true },
        }),
      ]);

      await manager.delete(Media, id);

      return {
        media,
        usedIn: [
          ...toUsage('article', articleRows),
          ...toUsage('case', caseRows),
          ...toUsage('news', newsRows),
          ...toUsage('landing', landingRows),
        ],
      };
    });
  }
}
