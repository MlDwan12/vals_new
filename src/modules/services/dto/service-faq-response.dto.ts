import { ServiceFaq } from '../domain/service-faq.entity';

export class ServiceFaqResponseDto {
  id: number;
  serviceId: number;
  question: string;
  answer: string;
  createdAt: Date;
  updatedAt: Date;

  static fromEntity(faq: ServiceFaq): ServiceFaqResponseDto {
    const dto = new ServiceFaqResponseDto();
    dto.id = faq.id;
    dto.serviceId = faq.serviceId;
    dto.question = faq.question;
    dto.answer = faq.answer;
    dto.createdAt = faq.createdAt;
    dto.updatedAt = faq.updatedAt;
    return dto;
  }
}
