import { ServiceStep } from '../domain/service-step.entity';

export class ServiceStepResponseDto {
  id: number;
  step: number;
  title: string;
  description: string;
  time: string | null;
  serviceId: number;

  static fromEntity(step: ServiceStep): ServiceStepResponseDto {
    const dto = new ServiceStepResponseDto();
    dto.id = step.id;
    dto.step = step.step;
    dto.title = step.title;
    dto.description = step.description;
    dto.time = step.time;
    dto.serviceId = step.serviceId;
    return dto;
  }
}
