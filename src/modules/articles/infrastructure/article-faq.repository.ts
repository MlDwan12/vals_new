import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { isEmptyPatch } from '../../../core/persistence/is-empty-patch.util';
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

  // Для reindex поиска — вопрос/ответ + slug и статус публикации родительской статьи одним JOIN,
  // без N+1 (нужно решить, попадает ли каждый FAQ в индекс, ещё до формирования документов).
  findAllForSearchIndex(): Promise<
    {
      id: number;
      question: string;
      answer: string;
      articleSlug: string;
      articleDatePublished: Date | null;
    }[]
  > {
    return this.repo
      .createQueryBuilder('faq')
      .innerJoin('faq.article', 'article')
      .select('faq.id', 'id')
      .addSelect('faq.question', 'question')
      .addSelect('faq.answer', 'answer')
      .addSelect('article.slug', 'articleSlug')
      .addSelect('article.datePublished', 'articleDatePublished')
      .getRawMany();
  }

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
    if (!isEmptyPatch(patch)) {
      await this.repo.update(id, patch);
    }
    return this.findById(id);
  }

  async remove(id: number): Promise<void> {
    await this.repo.delete(id);
  }
}
