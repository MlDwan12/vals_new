import { CaseShortDto } from '../../cases/dto/case-short.dto';
import { IndustryResponseDto } from '../../industries/dto/industry-response.dto';
import { MediaCoverDto } from '../../media/dto/media-cover.dto';
import { ServiceShortDto } from '../../services/dto/service-short.dto';
import { Landing } from '../domain/landing.entity';
import { LandingFaqResponseDto } from './landing-faq-response.dto';

// Полная карточка нишевой страницы (публичная "info" и админская "по id").
export class LandingResponseDto {
  id: number;
  slug: string;
  title: string;
  h1: string;
  subtitle: string | null;
  content: Record<string, unknown>;
  contentHtml: string | null;
  metaTitle: string | null;
  metaDescription: string | null;
  keywords: string | null;
  advantages: string[] | null;
  ctaTitle: string | null;
  ctaSubtitle: string | null;
  ctaButtonText: string | null;
  isPublished: boolean;
  priority: number;
  createdAt: Date;
  updatedAt: Date;
  service: ServiceShortDto;
  industry: IndustryResponseDto;
  cover: MediaCoverDto | null;
  cases: CaseShortDto[];
  faq: LandingFaqResponseDto[];

  static fromEntity(landing: Landing): LandingResponseDto {
    const dto = new LandingResponseDto();
    dto.id = landing.id;
    dto.slug = landing.slug;
    dto.title = landing.title;
    dto.h1 = landing.h1;
    dto.subtitle = landing.subtitle;
    dto.content = landing.content;
    dto.contentHtml = landing.contentHtml;
    dto.metaTitle = landing.metaTitle;
    dto.metaDescription = landing.metaDescription;
    dto.keywords = landing.keywords;
    dto.advantages = landing.advantages;
    dto.ctaTitle = landing.ctaTitle;
    dto.ctaSubtitle = landing.ctaSubtitle;
    dto.ctaButtonText = landing.ctaButtonText;
    dto.isPublished = landing.isPublished;
    dto.priority = landing.priority;
    dto.createdAt = landing.createdAt;
    dto.updatedAt = landing.updatedAt;
    dto.service = ServiceShortDto.fromEntity(landing.service);
    dto.industry = IndustryResponseDto.fromEntity(landing.industry);
    dto.cover = landing.cover ? MediaCoverDto.fromEntity(landing.cover) : null;
    dto.cases = landing.cases.map((item) => CaseShortDto.fromEntity(item));
    dto.faq = landing.faq.map((item) => LandingFaqResponseDto.fromEntity(item));
    return dto;
  }
}
