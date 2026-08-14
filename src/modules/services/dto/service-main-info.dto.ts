import { Service } from '../domain/service.entity';

// Админ-список услуг — без тяжёлых полей (description/steps/tariffs/faq).
export class ServiceMainInfoDto {
  id: number;
  slug: string;
  title: string;
  createdAt: Date;
  updatedAt: Date;

  static fromEntity(service: Service): ServiceMainInfoDto {
    const dto = new ServiceMainInfoDto();
    dto.id = service.id;
    dto.slug = service.slug;
    dto.title = service.title;
    dto.createdAt = service.createdAt;
    dto.updatedAt = service.updatedAt;
    return dto;
  }
}
