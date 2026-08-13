import { EmployeeShortDto } from '../../employees/dto/employee-short.dto';
import { TagShortDto } from '../../tags/dto/tag-short.dto';
import { Article } from '../domain/article.entity';

// Проекция для списков (публичного и админского) — без тяжёлых полей (content/contentHtml/meta*/faq).
export class ArticleMainInfoDto {
  id: number;
  slug: string;
  title: string;
  description: string | null;
  datePublished: Date | null;
  priority: number;
  readingTime: number | null;
  createdAt: Date;
  updatedAt: Date;
  authors: EmployeeShortDto[];
  tags: TagShortDto[];

  static fromEntity(article: Article): ArticleMainInfoDto {
    const dto = new ArticleMainInfoDto();
    dto.id = article.id;
    dto.slug = article.slug;
    dto.title = article.title;
    dto.description = article.description;
    dto.datePublished = article.datePublished;
    dto.priority = article.priority;
    dto.readingTime = article.readingTime;
    dto.createdAt = article.createdAt;
    dto.updatedAt = article.updatedAt;
    dto.authors = article.authors.map((author) =>
      EmployeeShortDto.fromEntity(author),
    );
    dto.tags = article.tags.map((tag) => TagShortDto.fromEntity(tag));
    return dto;
  }
}
