import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  buildPaginatedResult,
  PaginatedResult,
} from '../../../core/pagination/paginated-result.interface';
import { ArticlesRepository } from '../infrastructure/articles.repository';
import { ArticleFaq } from '../domain/article-faq.entity';
import { ArticleFaqResponseDto } from '../dto/article-faq-response.dto';
import { CreateArticleFaqDto } from '../dto/create-article-faq.dto';
import { UpdateArticleFaqDto } from '../dto/update-article-faq.dto';
import { ArticleFaqRepository } from '../infrastructure/article-faq.repository';

@Injectable()
export class ArticleFaqService {
  constructor(
    private readonly articleFaqRepository: ArticleFaqRepository,
    private readonly articlesRepository: ArticlesRepository,
  ) {}

  async create(dto: CreateArticleFaqDto): Promise<ArticleFaqResponseDto> {
    await this.assertArticleExists(dto.articleId);
    const faq = await this.articleFaqRepository.create(dto);
    return ArticleFaqResponseDto.fromEntity(faq);
  }

  async update(
    id: number,
    dto: UpdateArticleFaqDto,
  ): Promise<ArticleFaqResponseDto> {
    if (dto.articleId !== undefined) {
      await this.assertArticleExists(dto.articleId);
    }

    const updated = await this.articleFaqRepository.update(id, dto);
    if (!updated) {
      throw new NotFoundException(`FAQ с ID ${id} не найдено`);
    }
    return ArticleFaqResponseDto.fromEntity(updated);
  }

  async remove(id: number): Promise<void> {
    await this.findEntityByIdOrFail(id);
    await this.articleFaqRepository.remove(id);
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

  private async assertArticleExists(articleId: number): Promise<void> {
    if (!(await this.articlesRepository.existsById(articleId))) {
      throw new BadRequestException(`Статья с ID ${articleId} не найдена`);
    }
  }
}
