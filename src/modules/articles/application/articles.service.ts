import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PaginatedResult } from '../../../core/pagination/paginated-result.interface';
import { applyDefinedFields } from '../../../core/persistence/apply-defined-fields.util';
import { Employee } from '../../employees/domain/employee.entity';
import { EmployeesRepository } from '../../employees/infrastructure/employees.repository';
import { Tag } from '../../tags/domain/tag.entity';
import { TagsRepository } from '../../tags/infrastructure/tags.repository';
import { Article } from '../domain/article.entity';
import { ArticleListQueryDto } from '../dto/article-list-query.dto';
import { ArticleMainInfoDto } from '../dto/article-main-info.dto';
import { ArticleResponseDto } from '../dto/article-response.dto';
import { ArticleSitemapItemDto } from '../dto/article-sitemap-item.dto';
import { CreateArticleDto } from '../dto/create-article.dto';
import { UpdateArticleDto } from '../dto/update-article.dto';
import { ArticlesRepository } from '../infrastructure/articles.repository';

@Injectable()
export class ArticlesService {
  constructor(
    private readonly articlesRepository: ArticlesRepository,
    private readonly employeesRepository: EmployeesRepository,
    private readonly tagsRepository: TagsRepository,
  ) {}

  async create(dto: CreateArticleDto): Promise<ArticleResponseDto> {
    const authors = await this.resolveAuthors(dto.authorIds);
    const tags = await this.resolveTags(dto.tagIds);

    const article = this.articlesRepository.create({
      slug: dto.slug,
      title: dto.title,
      description: dto.description,
      content: dto.content,
      contentHtml: dto.contentHtml,
      metaTitle: dto.metaTitle,
      metaDescription: dto.metaDescription,
      keywords: dto.keywords,
      datePublished: dto.datePublished ? new Date(dto.datePublished) : null,
      priority: dto.priority ?? 0,
      readingTime: dto.readingTime ?? null,
      hasToc: dto.hasToc ?? false,
      authors,
      tags,
    });

    const saved = await this.articlesRepository.save(article);
    return ArticleResponseDto.fromEntity(
      await this.findEntityByIdOrFail(saved.id),
    );
  }

  async update(id: number, dto: UpdateArticleDto): Promise<ArticleResponseDto> {
    const article = await this.findEntityByIdOrFail(id);

    if (dto.authorIds !== undefined) {
      article.authors = await this.resolveAuthors(dto.authorIds);
    }
    if (dto.tagIds !== undefined) {
      article.tags = await this.resolveTags(dto.tagIds);
    }
    // datePublished — отдельно от общего хелпера ниже: значение нужно конвертировать в Date,
    // а простое присутствие ключа в DTO (в т.ч. null) уже отличает "не трогать" от "обнулить".
    if ('datePublished' in dto) {
      article.datePublished = dto.datePublished
        ? new Date(dto.datePublished)
        : null;
    }

    applyDefinedFields(article, {
      slug: dto.slug,
      title: dto.title,
      description: dto.description,
      content: dto.content,
      contentHtml: dto.contentHtml,
      metaTitle: dto.metaTitle,
      metaDescription: dto.metaDescription,
      keywords: dto.keywords,
      priority: dto.priority,
      readingTime: dto.readingTime,
      hasToc: dto.hasToc,
    });

    const saved = await this.articlesRepository.save(article);
    return ArticleResponseDto.fromEntity(
      await this.findEntityByIdOrFail(saved.id),
    );
  }

  async remove(id: number): Promise<void> {
    await this.findEntityByIdOrFail(id);
    await this.articlesRepository.remove(id);
  }

  async findById(id: number): Promise<ArticleResponseDto> {
    return ArticleResponseDto.fromEntity(await this.findEntityByIdOrFail(id));
  }

  async findBySlugPublished(slug: string): Promise<ArticleResponseDto> {
    const article = await this.articlesRepository.findBySlugPublished(slug);
    if (!article) {
      throw new NotFoundException(`Статья со slug "${slug}" не найдена`);
    }
    return ArticleResponseDto.fromEntity(article);
  }

  async findList(
    query: ArticleListQueryDto,
  ): Promise<PaginatedResult<ArticleMainInfoDto>> {
    const result = await this.articlesRepository.findMainInfoList(query);
    return {
      ...result,
      items: result.items.map((article) =>
        ArticleMainInfoDto.fromEntity(article),
      ),
    };
  }

  // Публичный список сайта — только опубликованные (datePublished <= now).
  async findPublishedList(
    query: ArticleListQueryDto,
  ): Promise<PaginatedResult<ArticleMainInfoDto>> {
    const result =
      await this.articlesRepository.findPublishedMainInfoList(query);
    return {
      ...result,
      items: result.items.map((article) =>
        ArticleMainInfoDto.fromEntity(article),
      ),
    };
  }

  findAllPublishedSitemapItems(): Promise<ArticleSitemapItemDto[]> {
    return this.articlesRepository.findAllPublishedSitemapItems();
  }

  async findSimilarPublished(
    tagIds: number[],
    excludeId: number | undefined,
    limit: number,
  ): Promise<ArticleMainInfoDto[]> {
    if (!tagIds.length) return [];

    const ids = await this.articlesRepository.findSimilarRankedIds(
      tagIds,
      excludeId,
      limit,
    );
    const articles = await this.articlesRepository.findMainInfoByIds(ids);
    return articles.map((article) => ArticleMainInfoDto.fromEntity(article));
  }

  private async findEntityByIdOrFail(id: number): Promise<Article> {
    const article = await this.articlesRepository.findById(id);
    if (!article) {
      throw new NotFoundException(`Статья с ID ${id} не найдена`);
    }
    return article;
  }

  private async resolveAuthors(authorIds: number[]): Promise<Employee[]> {
    const uniqueIds = Array.from(new Set(authorIds));
    if (uniqueIds.length === 0) {
      throw new BadRequestException('authorIds не должен быть пустым');
    }

    const authors = await this.employeesRepository.findByIds(uniqueIds);
    this.assertAllFound(
      'Сотрудники',
      uniqueIds,
      authors.map((author) => author.id),
    );
    return authors;
  }

  private async resolveTags(tagIds?: number[]): Promise<Tag[]> {
    const uniqueIds = Array.from(new Set(tagIds ?? []));
    if (uniqueIds.length === 0) return [];

    const tags = await this.tagsRepository.findByIds(uniqueIds);
    this.assertAllFound(
      'Теги',
      uniqueIds,
      tags.map((tag) => tag.id),
    );
    return tags;
  }

  private assertAllFound(
    label: string,
    requested: number[],
    found: number[],
  ): void {
    if (found.length === requested.length) return;

    const foundSet = new Set(found);
    const missing = requested.filter((id) => !foundSet.has(id));
    throw new BadRequestException(`${label} не найдены: ${missing.join(', ')}`);
  }
}
