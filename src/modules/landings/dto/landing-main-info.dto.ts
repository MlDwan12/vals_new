import { IndustryResponseDto } from '../../industries/dto/industry-response.dto';
import { MediaCoverDto } from '../../media/dto/media-cover.dto';
import { ServiceShortDto } from '../../services/dto/service-short.dto';
import { Landing } from '../domain/landing.entity';

// Проекция для списков (публичного и админского) — без тяжёлых полей (content/contentHtml/meta*/
// faq/cases), по образцу ArticleMainInfoDto.
export class LandingMainInfoDto {
  id: number;
  slug: string;
  title: string;
  subtitle: string | null;
  isPublished: boolean;
  priority: number;
  createdAt: Date;
  updatedAt: Date;
  service: ServiceShortDto;
  industry: IndustryResponseDto;
  cover: MediaCoverDto | null;

  static fromEntity(landing: Landing): LandingMainInfoDto {
    const dto = new LandingMainInfoDto();
    dto.id = landing.id;
    dto.slug = landing.slug;
    dto.title = landing.title;
    dto.subtitle = landing.subtitle;
    dto.isPublished = landing.isPublished;
    dto.priority = landing.priority;
    dto.createdAt = landing.createdAt;
    dto.updatedAt = landing.updatedAt;
    dto.service = ServiceShortDto.fromEntity(landing.service);
    dto.industry = IndustryResponseDto.fromEntity(landing.industry);
    dto.cover = landing.cover ? MediaCoverDto.fromEntity(landing.cover) : null;
    return dto;
  }
}
