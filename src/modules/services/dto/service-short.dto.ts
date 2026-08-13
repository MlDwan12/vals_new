import { Service } from '../domain/service.entity';

// Лёгкая проекция услуги — для карточки кейса (связь services).
export class ServiceShortDto {
  id: number;
  slug: string;
  title: string;

  static fromEntity(service: Service): ServiceShortDto {
    const dto = new ServiceShortDto();
    dto.id = service.id;
    dto.slug = service.slug;
    dto.title = service.title;
    return dto;
  }
}
