import { EmployeeShortDto } from '../../employees/dto/employee-short.dto';
import { MediaCoverDto } from '../../media/dto/media-cover.dto';
import { TagShortDto } from '../../tags/dto/tag-short.dto';
import { News } from '../domain/news.entity';

// Полная карточка новости (публичная "info/:slug" и админская "по id") — вместо утечки entity наружу.
export class NewsResponseDto {
  id: number;
  slug: string;
  title: string;
  announce: string | null;
  content: Record<string, unknown>;
  contentHtml: string | null;
  metaTitle: string | null;
  metaDescription: string | null;
  keywords: string | null;
  datePublished: Date | null;
  priority: number;
  createdAt: Date;
  updatedAt: Date;
  cover: MediaCoverDto | null;
  authors: EmployeeShortDto[];
  tags: TagShortDto[];

  static fromEntity(news: News): NewsResponseDto {
    const dto = new NewsResponseDto();
    dto.id = news.id;
    dto.slug = news.slug;
    dto.title = news.title;
    dto.announce = news.announce;
    dto.content = news.content;
    dto.contentHtml = news.contentHtml;
    dto.metaTitle = news.metaTitle;
    dto.metaDescription = news.metaDescription;
    dto.keywords = news.keywords;
    dto.datePublished = news.datePublished;
    dto.priority = news.priority;
    dto.createdAt = news.createdAt;
    dto.updatedAt = news.updatedAt;
    dto.cover = news.cover ? MediaCoverDto.fromEntity(news.cover) : null;
    dto.authors = news.authors.map((author) =>
      EmployeeShortDto.fromEntity(author),
    );
    dto.tags = news.tags.map((tag) => TagShortDto.fromEntity(tag));
    return dto;
  }
}
