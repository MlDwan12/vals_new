import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  buildPaginatedResult,
  PaginatedResult,
} from '../../../core/pagination/paginated-result.interface';
import { GlobalSearchDocument } from '../../search/application/global-search-document.interface';
import { SearchIndexService } from '../../search/application/search-index.service';
import { buildFaqSearchDocument } from '../../search/application/faq-search-document.util';
import { ArticlesRepository } from '../infrastructure/articles.repository';
import { Article } from '../domain/article.entity';
import { ArticleFaq } from '../domain/article-faq.entity';

type ArticleMeta = Pick<Article, 'id' | 'slug' | 'datePublished'>;
import { ArticleFaqResponseDto } from '../dto/article-faq-response.dto';
import { CreateArticleFaqDto } from '../dto/create-article-faq.dto';
import { UpdateArticleFaqDto } from '../dto/update-article-faq.dto';
import { ArticleFaqRepository } from '../infrastructure/article-faq.repository';

@Injectable()
export class ArticleFaqService {
  constructor(
    private readonly articleFaqRepository: ArticleFaqRepository,
    private readonly articlesRepository: ArticlesRepository,
    private readonly searchIndexService: SearchIndexService,
  ) {}

  async create(dto: CreateArticleFaqDto): Promise<ArticleFaqResponseDto> {
    const article = await this.resolveArticle(dto.articleId);
    const faq = await this.articleFaqRepository.create(dto);
    await this.indexFaq(faq, article);
    return ArticleFaqResponseDto.fromEntity(faq);
  }

  async update(
    id: number,
    dto: UpdateArticleFaqDto,
  ): Promise<ArticleFaqResponseDto> {
    const existing = await this.findEntityByIdOrFail(id);
    const article = await this.resolveArticle(
      dto.articleId ?? existing.articleId,
    );

    const updated = await this.articleFaqRepository.update(id, dto);
    if (!updated) {
      throw new NotFoundException(`FAQ с ID ${id} не найдено`);
    }
    await this.indexFaq(updated, article);
    return ArticleFaqResponseDto.fromEntity(updated);
  }

  async remove(id: number): Promise<void> {
    await this.findEntityByIdOrFail(id);
    await this.articleFaqRepository.remove(id);
    await this.searchIndexService.deleteDocuments([`articleFaq_${id}`]);
  }

  // Полный список документов для reindex — вызывается из ArticlesService.reindexSearch(), не
  // отдельным admin-эндпоинтом (в новой схеме FAQ статьи не самостоятельный раздел поиска, а
  // часть переиндексации статей).
  async buildAllSearchDocuments(now: Date): Promise<GlobalSearchDocument[]> {
    const rows = await this.articleFaqRepository.findAllForSearchIndex();
    return rows
      .filter(
        (row) =>
          row.articleDatePublished !== null && row.articleDatePublished <= now,
      )
      .map((row) =>
        buildFaqSearchDocument({
          idPrefix: 'articleFaq',
          id: row.id,
          question: row.question,
          answer: row.answer,
          parentUrl: `/articles/${row.articleSlug}`,
        }),
      );
  }

  async findById(id: number): Promise<ArticleFaqResponseDto> {
    return ArticleFaqResponseDto.fromEntity(
      await this.findEntityByIdOrFail(id),
    );
  }

  async paginate(
    page: number,
    limit: number,
  ): Promise<PaginatedResult<ArticleFaqResponseDto>> {
    const [items, total] = await this.articleFaqRepository.findAndCount(
      page,
      limit,
    );
    return buildPaginatedResult(
      items.map((item) => ArticleFaqResponseDto.fromEntity(item)),
      total,
      page,
      limit,
    );
  }

  private async findEntityByIdOrFail(id: number): Promise<ArticleFaq> {
    const faq = await this.articleFaqRepository.findById(id);
    if (!faq) {
      throw new NotFoundException(`FAQ с ID ${id} не найдено`);
    }
    return faq;
  }

  private async resolveArticle(articleId: number): Promise<ArticleMeta> {
    const article =
      await this.articlesRepository.findPublicationMetaById(articleId);
    if (!article) {
      throw new BadRequestException(`Статья с ID ${articleId} не найдена`);
    }
    return article;
  }

  // Черновик/отложенная статья — FAQ не должен утекать в публичный поиск раньше самой статьи.
  private async indexFaq(faq: ArticleFaq, article: ArticleMeta): Promise<void> {
    const doc = buildFaqSearchDocument({
      idPrefix: 'articleFaq',
      id: faq.id,
      question: faq.question,
      answer: faq.answer,
      parentUrl: `/articles/${article.slug}`,
    });

    const isPublished =
      article.datePublished !== null && article.datePublished <= new Date();

    if (isPublished) {
      await this.searchIndexService.upsertDocuments([doc]);
    } else {
      await this.searchIndexService.deleteDocuments([doc.id]);
    }
  }
}
