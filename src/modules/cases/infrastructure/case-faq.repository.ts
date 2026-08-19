import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { isEmptyPatch } from '../../../core/persistence/is-empty-patch.util';
import { CaseFaq } from '../domain/case-faq.entity';

interface CreateCaseFaqRecord {
  caseId: number;
  question: string;
  answer: string;
}

type UpdateCaseFaqRecord = Partial<CreateCaseFaqRecord>;

@Injectable()
export class CaseFaqRepository {
  constructor(
    @InjectRepository(CaseFaq) private readonly repo: Repository<CaseFaq>,
  ) {}

  // Для reindex поиска — вопрос/ответ + slug и статус публикации родительского кейса одним JOIN.
  findAllForSearchIndex(): Promise<
    {
      id: number;
      question: string;
      answer: string;
      caseSlug: string;
      caseDatePublished: Date | null;
    }[]
  > {
    return this.repo
      .createQueryBuilder('faq')
      .innerJoin('faq.case', 'caseEntity')
      .select('faq.id', 'id')
      .addSelect('faq.question', 'question')
      .addSelect('faq.answer', 'answer')
      .addSelect('caseEntity.slug', 'caseSlug')
      .addSelect('caseEntity.datePublished', 'caseDatePublished')
      .getRawMany();
  }

  findAndCount(page: number, limit: number): Promise<[CaseFaq[], number]> {
    return this.repo.findAndCount({
      order: { id: 'ASC' },
      skip: (page - 1) * limit,
      take: limit,
    });
  }

  findById(id: number): Promise<CaseFaq | null> {
    return this.repo.findOne({ where: { id } });
  }

  create(data: CreateCaseFaqRecord): Promise<CaseFaq> {
    return this.repo.save(this.repo.create(data));
  }

  async update(
    id: number,
    patch: UpdateCaseFaqRecord,
  ): Promise<CaseFaq | null> {
    if (!isEmptyPatch(patch)) {
      await this.repo.update(id, patch);
    }
    return this.findById(id);
  }

  async remove(id: number): Promise<void> {
    await this.repo.delete(id);
  }
}
