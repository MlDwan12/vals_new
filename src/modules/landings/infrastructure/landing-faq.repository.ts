import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { assertRawRowShape } from '../../../core/persistence/assert-raw-row-shape.util';
import { isEmptyPatch } from '../../../core/persistence/is-empty-patch.util';
import { LandingFaq } from '../domain/landing-faq.entity';

interface CreateLandingFaqRecord {
  landingId: number;
  question: string;
  answer: string;
}

type UpdateLandingFaqRecord = Partial<CreateLandingFaqRecord>;

interface LandingFaqSearchIndexRow {
  id: number;
  question: string;
  answer: string;
  landingSlug: string;
  serviceSlug: string;
  landingIsPublished: boolean;
}

@Injectable()
export class LandingFaqRepository {
  constructor(
    @InjectRepository(LandingFaq)
    private readonly repo: Repository<LandingFaq>,
  ) {}

  // Для reindex поиска — вопрос/ответ + оба slug'а и статус публикации родительской страницы одним
  // JOIN, без N+1 (тот же приём, что ArticleFaqRepository.findAllForSearchIndex).
  async findAllForSearchIndex(): Promise<LandingFaqSearchIndexRow[]> {
    const rows = await this.repo
      .createQueryBuilder('faq')
      .innerJoin('faq.landing', 'landing')
      .innerJoin('landing.service', 'service')
      .select('faq.id', 'id')
      .addSelect('faq.question', 'question')
      .addSelect('faq.answer', 'answer')
      .addSelect('landing.slug', 'landingSlug')
      .addSelect('service.slug', 'serviceSlug')
      .addSelect('landing.isPublished', 'landingIsPublished')
      .getRawMany<LandingFaqSearchIndexRow>();

    rows.forEach((row) =>
      assertRawRowShape(
        row,
        {
          id: 'number',
          question: 'string',
          answer: 'string',
          landingSlug: 'string',
          serviceSlug: 'string',
        },
        'findAllForSearchIndex',
      ),
    );
    return rows;
  }

  findAndCount(page: number, limit: number): Promise<[LandingFaq[], number]> {
    return this.repo.findAndCount({
      order: { id: 'ASC' },
      skip: (page - 1) * limit,
      take: limit,
    });
  }

  findById(id: number): Promise<LandingFaq | null> {
    return this.repo.findOne({ where: { id } });
  }

  create(data: CreateLandingFaqRecord): Promise<LandingFaq> {
    return this.repo.save(this.repo.create(data));
  }

  async update(
    id: number,
    patch: UpdateLandingFaqRecord,
  ): Promise<LandingFaq | null> {
    if (!isEmptyPatch(patch)) {
      await this.repo.update(id, patch);
    }
    return this.findById(id);
  }

  async remove(id: number): Promise<void> {
    await this.repo.delete(id);
  }
}
