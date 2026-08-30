import { EmployeeShortDto } from '../../employees/dto/employee-short.dto';
import { MediaCoverDto } from '../../media/dto/media-cover.dto';
import { TagShortDto } from '../../tags/dto/tag-short.dto';
import { News } from '../domain/news.entity';

// Проекция для списков (публичного и админского) — без тяжёлых полей (content/contentHtml/meta*).
export class NewsMainInfoDto {
  id: number;
  slug: string;
  title: string;
  announce: string | null;
  datePublished: Date | null;
  priority: number;
  createdAt: Date;
  updatedAt: Date;
  cover: MediaCoverDto | null;
  authors: EmployeeShortDto[];
  tags: TagShortDto[];

  static fromEntity(news: News): NewsMainInfoDto {
    const dto = new NewsMainInfoDto();
    dto.id = news.id;
    dto.slug = news.slug;
    dto.title = news.title;
    dto.announce = news.announce;
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
