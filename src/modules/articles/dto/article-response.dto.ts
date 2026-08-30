import { EmployeeShortDto } from '../../employees/dto/employee-short.dto';
import { MediaCoverDto } from '../../media/dto/media-cover.dto';
import { TagShortDto } from '../../tags/dto/tag-short.dto';
import { Article } from '../domain/article.entity';
import { ArticleFaqResponseDto } from './article-faq-response.dto';

// Полная карточка статьи (публичная "info/:slug" и админская "по id") — вместо утечки entity наружу.
export class ArticleResponseDto {
  id: number;
  slug: string;
  title: string;
  description: string | null;
  content: Record<string, unknown>;
  contentHtml: string | null;
  metaTitle: string | null;
  metaDescription: string | null;
  keywords: string | null;
  datePublished: Date | null;
  priority: number;
  readingTime: number | null;
  hasToc: boolean;
  createdAt: Date;
  updatedAt: Date;
  cover: MediaCoverDto | null;
  authors: EmployeeShortDto[];
  tags: TagShortDto[];
  faq: ArticleFaqResponseDto[];

  static fromEntity(article: Article): ArticleResponseDto {
    const dto = new ArticleResponseDto();
    dto.id = article.id;
    dto.slug = article.slug;
    dto.title = article.title;
    dto.description = article.description;
    dto.content = article.content;
    dto.contentHtml = article.contentHtml;
    dto.metaTitle = article.metaTitle;
    dto.metaDescription = article.metaDescription;
    dto.keywords = article.keywords;
    dto.datePublished = article.datePublished;
    dto.priority = article.priority;
    dto.readingTime = article.readingTime;
    dto.hasToc = article.hasToc;
    dto.createdAt = article.createdAt;
    dto.updatedAt = article.updatedAt;
    dto.cover = article.cover ? MediaCoverDto.fromEntity(article.cover) : null;
    dto.authors = article.authors.map((author) =>
      EmployeeShortDto.fromEntity(author),
    );
    dto.tags = article.tags.map((tag) => TagShortDto.fromEntity(tag));
    dto.faq = article.faq.map((item) => ArticleFaqResponseDto.fromEntity(item));
    return dto;
  }
}
