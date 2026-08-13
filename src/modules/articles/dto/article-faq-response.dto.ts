import { ArticleFaq } from '../domain/article-faq.entity';

export class ArticleFaqResponseDto {
  id: number;
  articleId: number;
  question: string;
  answer: string;
  createdAt: Date;
  updatedAt: Date;

  static fromEntity(faq: ArticleFaq): ArticleFaqResponseDto {
    const dto = new ArticleFaqResponseDto();
    dto.id = faq.id;
    dto.articleId = faq.articleId;
    dto.question = faq.question;
    dto.answer = faq.answer;
    dto.createdAt = faq.createdAt;
    dto.updatedAt = faq.updatedAt;
    return dto;
  }
}
