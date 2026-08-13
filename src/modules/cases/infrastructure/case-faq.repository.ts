import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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
    await this.repo.update(id, patch);
    return this.findById(id);
  }

  async remove(id: number): Promise<void> {
    await this.repo.delete(id);
  }
}
