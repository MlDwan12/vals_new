import { ServiceCategory } from '../domain/service-category.entity';

// Лёгкая проекция категории — embed в ответах об услуге.
export class ServiceCategoryShortDto {
  id: number;
  name: string;

  static fromEntity(category: ServiceCategory): ServiceCategoryShortDto {
    const dto = new ServiceCategoryShortDto();
    dto.id = category.id;
    dto.name = category.name;
    return dto;
  }
}
