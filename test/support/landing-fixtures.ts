import { Repository } from 'typeorm';
import { Industry } from '../../src/modules/industries/domain/industry.entity';
import { Service } from '../../src/modules/services/domain/service.entity';
import { ServiceCategory } from '../../src/modules/services/domain/service-category.entity';
import { ServiceBackgroundColor } from '../../src/modules/services/enums/service-background-color.enum';

// Общие фикстуры для landings-e2e (нишевая страница требует и Service, и Industry как обязательные
// FK) — переиспользуется между landing-publication-visibility.e2e-spec.ts и landings.e2e-spec.ts,
// чтобы не дублировать одинаковый boilerplate создания Service+ServiceCategory в каждом файле.
export async function createTestService(
  services: Repository<Service>,
  serviceCategories: Repository<ServiceCategory>,
  slug: string,
): Promise<Service> {
  const category = await serviceCategories.save(
    serviceCategories.create({ name: `Категория ${slug}` }),
  );
  return services.save(
    services.create({
      slug,
      category,
      title: 'Услуга',
      description: 'Описание',
      subDescription: 'Подописание',
      icon: 'icon',
      backgroundColor: ServiceBackgroundColor.WHITE,
    }),
  );
}

export function createTestIndustry(
  industries: Repository<Industry>,
  slug: string,
): Promise<Industry> {
  return industries.save(industries.create({ slug, name: `Отрасль ${slug}` }));
}
