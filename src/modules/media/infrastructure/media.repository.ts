import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  buildPaginatedResult,
  PaginatedResult,
} from '../../../core/pagination/paginated-result.interface';
import { escapeLikePattern } from '../../../core/persistence/escape-like-pattern.util';
import { MediaListQueryDto } from '../dto/media-list-query.dto';
import { Media } from '../domain/media.entity';

interface CreateMediaRecord {
  name: string;
  fileName: string;
  alt: string | null;
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

  async remove(id: number): Promise<void> {
    await this.repo.delete(id);
  }
}
