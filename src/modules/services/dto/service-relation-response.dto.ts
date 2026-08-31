import { ServiceRelation } from '../domain/service-relation.entity';

export class ServiceRelationResponseDto {
  id: number;
  serviceId: number;
  relatedServiceId: number;
  order: number;

  static fromEntity(relation: ServiceRelation): ServiceRelationResponseDto {
    const dto = new ServiceRelationResponseDto();
    dto.id = relation.id;
    dto.serviceId = relation.serviceId;
    dto.relatedServiceId = relation.relatedServiceId;
    dto.order = relation.order;
    return dto;
  }
}
