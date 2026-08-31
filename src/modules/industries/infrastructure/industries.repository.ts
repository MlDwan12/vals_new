import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Not, Repository } from 'typeorm';
import { isEmptyPatch } from '../../../core/persistence/is-empty-patch.util';
import { Industry } from '../domain/industry.entity';
// Только класс-ссылка для manager.find() — см. тот же приём и причину в
// ServicesRepository.findReferencingLandings.
import { Landing } from '../../landings/domain/landing.entity';

interface CreateIndustryRecord {
  slug?: string;
  name: string;
}

type UpdateIndustryRecord = Partial<CreateIndustryRecord>;

@Injectable()
export class IndustriesRepository {
  constructor(
    @InjectRepository(Industry) private readonly repo: Repository<Industry>,
  ) {}

  findAndCount(page: number, limit: number): Promise<[Industry[], number]> {
    return this.repo.findAndCount({
      order: { id: 'ASC' },
      skip: (page - 1) * limit,
      take: limit,
    });
  }

  findById(id: number): Promise<Industry | null> {
    return this.repo.findOne({ where: { id } });
  }

  create(data: CreateIndustryRecord): Promise<Industry> {
    return this.repo.save(this.repo.create(data));
  }

  async update(
    id: number,
    patch: UpdateIndustryRecord,
  ): Promise<Industry | null> {
    if (!isEmptyPatch(patch)) {
      await this.repo.update(id, patch);
    }
    return this.findById(id);
  }

  async remove(id: number): Promise<void> {
    await this.repo.delete(id);
  }

  // Проверка перед удалением (RESTRICT на landings.industry_id, §10.1 expansion-decisions.md).
  findReferencingLandings(
    industryId: number,
  ): Promise<{ id: number; title: string }[]> {
    return this.repo.manager.find(Landing, {
      where: { industry: { id: industryId } },
      select: { id: true, title: true },
    });
  }

  // Публичный блок «Отрасли» — только те, у кого уже задан slug (страница есть).
  findPublishedList(): Promise<Industry[]> {
    return this.repo.find({
      where: { slug: Not(IsNull()) },
      order: { name: 'ASC' },
    });
  }

  // Публичная страница отрасли — /industries/info/:slug.
  findBySlugPublished(slug: string): Promise<Industry | null> {
    return this.repo.findOne({ where: { slug } });
  }
}
