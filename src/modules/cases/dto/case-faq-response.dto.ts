import { CaseFaq } from '../domain/case-faq.entity';

export class CaseFaqResponseDto {
  id: number;
  caseId: number;
  question: string;
  answer: string;
  createdAt: Date;
  updatedAt: Date;

  static fromEntity(faq: CaseFaq): CaseFaqResponseDto {
    const dto = new CaseFaqResponseDto();
    dto.id = faq.id;
    dto.caseId = faq.caseId;
    dto.question = faq.question;
    dto.answer = faq.answer;
    dto.createdAt = faq.createdAt;
    dto.updatedAt = faq.updatedAt;
    return dto;
  }
}
