import { LandingFaq } from '../domain/landing-faq.entity';

export class LandingFaqResponseDto {
  id: number;
  landingId: number;
  question: string;
  answer: string;
  createdAt: Date;
  updatedAt: Date;

  static fromEntity(faq: LandingFaq): LandingFaqResponseDto {
    const dto = new LandingFaqResponseDto();
    dto.id = faq.id;
    dto.landingId = faq.landingId;
    dto.question = faq.question;
    dto.answer = faq.answer;
    dto.createdAt = faq.createdAt;
    dto.updatedAt = faq.updatedAt;
    return dto;
  }
}
