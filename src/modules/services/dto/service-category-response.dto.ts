import { ServiceCategory } from '../domain/service-category.entity';

export class ServiceCategoryResponseDto {
  id: number;
  name: string;
  description: string | null;

  static fromEntity(category: ServiceCategory): ServiceCategoryResponseDto {
    const dto = new ServiceCategoryResponseDto();
    dto.id = category.id;
    dto.name = category.name;
    dto.description = category.description;
    return dto;
  }
}
