import { TariffEmbeddedDto } from '../../tariffs/dto/tariff-embedded.dto';
import { Service } from '../domain/service.entity';
import { ServiceBackgroundColor } from '../enums/service-background-color.enum';
import { ServiceCategoryShortDto } from './service-category-short.dto';
import { ServiceFaqResponseDto } from './service-faq-response.dto';
import { ServiceShortDto } from './service-short.dto';
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
  // Мета — EXPANSION_TASKS.md задача 9. Nullable — заполняется постепенно из панели, у
  // непровизионированных ещё услуг остаётся null (см. комментарий в service.entity.ts).
  metaTitle: string | null;
  metaDescription: string | null;
  keywords: string | null;
  h1: string | null;
  category: ServiceCategoryShortDto;
  // Контракт старого API — публичное поле называется stages (см. vals_api service.entity.ts),
  // внутреннее имя сущности/таблицы (service_steps) при этом не меняем.
  stages: ServiceStepResponseDto[];
  tariffs: TariffEmbeddedDto[];
  faq: ServiceFaqResponseDto[];
  // "Смотрите также" — задача 9, отсортировано по order.
  relatedServices: ServiceShortDto[];
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
    dto.metaTitle = service.metaTitle;
    dto.metaDescription = service.metaDescription;
    dto.keywords = service.keywords;
    dto.h1 = service.h1;
    dto.category = ServiceCategoryShortDto.fromEntity(service.category);
    dto.stages = service.steps
      .slice()
      .sort((a, b) => a.step - b.step)
      .map((step) => ServiceStepResponseDto.fromEntity(step));
    dto.tariffs = service.tariffs.map((tariff) =>
      TariffEmbeddedDto.fromEntity(tariff),
    );
    dto.faq = service.faq.map((item) => ServiceFaqResponseDto.fromEntity(item));
    // Порядок уже гарантирован FULL_ORDER.relatedServices на уровне SQL (services.repository.ts) —
    // повторная сортировка в JS избыточна, тот же принцип, что у tariffs выше (code review).
    dto.relatedServices = service.relatedServices.map((relation) =>
      ServiceShortDto.fromEntity(relation.relatedService),
    );
    dto.createdAt = service.createdAt;
    dto.updatedAt = service.updatedAt;
    return dto;
  }
}
