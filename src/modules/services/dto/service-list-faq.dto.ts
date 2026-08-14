import { Service } from '../domain/service.entity';
import { ServiceBackgroundColor } from '../enums/service-background-color.enum';
import { ServiceCategoryShortDto } from './service-category-short.dto';
import { ServiceFaqResponseDto } from './service-faq-response.dto';

// Публичный "list/faq" — база + категория + FAQ, без steps/tariffs.
export class ServiceListFaqDto {
  id: number;
  slug: string;
  title: string;
  subtitle: string | null;
  description: string;
  subDescription: string;
  list: string[] | null;
  icon: string;
  backgroundColor: ServiceBackgroundColor;
  category: ServiceCategoryShortDto;
  faq: ServiceFaqResponseDto[];

  static fromEntity(service: Service): ServiceListFaqDto {
    const dto = new ServiceListFaqDto();
    dto.id = service.id;
    dto.slug = service.slug;
    dto.title = service.title;
    dto.subtitle = service.subtitle;
    dto.description = service.description;
    dto.subDescription = service.subDescription;
    dto.list = service.list;
    dto.icon = service.icon;
    dto.backgroundColor = service.backgroundColor;
    dto.category = ServiceCategoryShortDto.fromEntity(service.category);
    dto.faq = service.faq.map((item) => ServiceFaqResponseDto.fromEntity(item));
    return dto;
  }
}
