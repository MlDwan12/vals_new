import { Service } from '../domain/service.entity';
import { ServiceBackgroundColor } from '../enums/service-background-color.enum';
import { ServiceCategoryShortDto } from './service-category-short.dto';

// Публичный "all/short-info" — база услуги + категория, без steps/tariffs/faq.
export class ServiceShortInfoDto {
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

  static fromEntity(service: Service): ServiceShortInfoDto {
    const dto = new ServiceShortInfoDto();
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
    return dto;
  }
}
