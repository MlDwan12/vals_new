import { TariffEmbeddedDto } from '../../tariffs/dto/tariff-embedded.dto';
import { Service } from '../domain/service.entity';
import { ServiceBackgroundColor } from '../enums/service-background-color.enum';
import { ServiceCategoryShortDto } from './service-category-short.dto';
import { ServiceFaqResponseDto } from './service-faq-response.dto';
import { ServiceStepResponseDto } from './service-step-response.dto';

// Публичный "all/info" и "all/full-info" (оба отдают один и тот же состав полей) и админская
// карточка услуги — база + категория + этапы + тарифы + FAQ, без вложенных кейсов.
export class ServiceFullInfoDto {
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
  // Контракт старого API — публичное поле называется stages (см. vals_api service.entity.ts),
  // внутреннее имя сущности/таблицы (service_steps) при этом не меняем.
  stages: ServiceStepResponseDto[];
  tariffs: TariffEmbeddedDto[];
  faq: ServiceFaqResponseDto[];
  createdAt: Date;
  updatedAt: Date;

  static fromEntity(service: Service): ServiceFullInfoDto {
    const dto = new ServiceFullInfoDto();
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
    dto.stages = service.steps
      .slice()
      .sort((a, b) => a.step - b.step)
      .map((step) => ServiceStepResponseDto.fromEntity(step));
    dto.tariffs = service.tariffs.map((tariff) =>
      TariffEmbeddedDto.fromEntity(tariff),
    );
    dto.faq = service.faq.map((item) => ServiceFaqResponseDto.fromEntity(item));
    dto.createdAt = service.createdAt;
    dto.updatedAt = service.updatedAt;
    return dto;
  }
}
