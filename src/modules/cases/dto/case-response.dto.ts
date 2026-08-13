import { EmployeeShortDto } from '../../employees/dto/employee-short.dto';
import { ServiceShortDto } from '../../services/dto/service-short.dto';
import { TagShortDto } from '../../tags/dto/tag-short.dto';
import { Case } from '../domain/case.entity';
import { CaseFaqResponseDto } from './case-faq-response.dto';

// Полная карточка кейса (публичная "info/case/:slug" и админская "по id"/"по slug") — вместо утечки entity наружу.
export class CaseResponseDto {
  id: number;
  slug: string;
  title: string;
  description: string | null;
  problem: string;
  result: string;
  industry: string[];
  content: Record<string, unknown> | null;
  contentHtml: string | null;
  metaTitle: string | null;
  metaDescription: string | null;
  keywords: string | null;
  datePublished: Date | null;
  priority: number;
  hasToc: boolean;
  createdAt: Date;
  updatedAt: Date;
  services: ServiceShortDto[];
  authors: EmployeeShortDto[];
  tags: TagShortDto[];
  faq: CaseFaqResponseDto[];

  static fromEntity(caseEntity: Case): CaseResponseDto {
    const dto = new CaseResponseDto();
    dto.id = caseEntity.id;
    dto.slug = caseEntity.slug;
    dto.title = caseEntity.title;
    dto.description = caseEntity.description;
    dto.problem = caseEntity.problem;
    dto.result = caseEntity.result;
    dto.industry = caseEntity.industry;
    dto.content = caseEntity.content;
    dto.contentHtml = caseEntity.contentHtml;
    dto.metaTitle = caseEntity.metaTitle;
    dto.metaDescription = caseEntity.metaDescription;
    dto.keywords = caseEntity.keywords;
    dto.datePublished = caseEntity.datePublished;
    dto.priority = caseEntity.priority;
    dto.hasToc = caseEntity.hasToc;
    dto.createdAt = caseEntity.createdAt;
    dto.updatedAt = caseEntity.updatedAt;
    dto.services = caseEntity.services.map((service) =>
      ServiceShortDto.fromEntity(service),
    );
    dto.authors = caseEntity.authors.map((author) =>
      EmployeeShortDto.fromEntity(author),
    );
    dto.tags = caseEntity.tags.map((tag) => TagShortDto.fromEntity(tag));
    dto.faq = caseEntity.faq.map((item) => CaseFaqResponseDto.fromEntity(item));
    return dto;
  }
}
