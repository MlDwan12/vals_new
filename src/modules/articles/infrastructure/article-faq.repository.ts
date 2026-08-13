import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ArticleFaq } from '../domain/article-faq.entity';

interface CreateArticleFaqRecord {
  articleId: number;
  question: string;
  answer: string;
}

type UpdateArticleFaqRecord = Partial<CreateArticleFaqRecord>;

@Injectable()
export class ArticleFaqRepository {
  constructor(
    @InjectRepository(ArticleFaq) private readonly repo: Repository<ArticleFaq>,
  ) {}

  findAndCount(page: number, limit: number): Promise<[ArticleFaq[], number]> {
    return this.repo.findAndCount({
      order: { id: 'ASC' },
      skip: (page - 1) * limit,
      take: limit,
    });
  }

  findById(id: number): Promise<ArticleFaq | null> {
    return this.repo.findOne({ where: { id } });
  }

  create(data: CreateArticleFaqRecord): Promise<ArticleFaq> {
    return this.repo.save(this.repo.create(data));
  }

  async update(
    id: number,
    patch: UpdateArticleFaqRecord,
  ): Promise<ArticleFaq | null> {
    await this.repo.update(id, patch);
    return this.findById(id);
  }

  async remove(id: number): Promise<void> {
    await this.repo.delete(id);
  }
}
