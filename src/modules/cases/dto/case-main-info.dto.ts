import { EmployeeShortDto } from '../../employees/dto/employee-short.dto';
import { TagShortDto } from '../../tags/dto/tag-short.dto';
import { Case } from '../domain/case.entity';

// Проекция для списков (публичного и админского) — без тяжёлых полей (content/contentHtml/meta*/faq/services).
export class CaseMainInfoDto {
  id: number;
  slug: string;
  title: string;
  description: string | null;
  problem: string;
  result: string;
  industry: string[];
  datePublished: Date | null;
  priority: number;
  createdAt: Date;
  updatedAt: Date;
  authors: EmployeeShortDto[];
  tags: TagShortDto[];

  static fromEntity(caseEntity: Case): CaseMainInfoDto {
    const dto = new CaseMainInfoDto();
    dto.id = caseEntity.id;
    dto.slug = caseEntity.slug;
    dto.title = caseEntity.title;
    dto.description = caseEntity.description;
    dto.problem = caseEntity.problem;
    dto.result = caseEntity.result;
    dto.industry = caseEntity.industry;
    dto.datePublished = caseEntity.datePublished;
    dto.priority = caseEntity.priority;
    dto.createdAt = caseEntity.createdAt;
    dto.updatedAt = caseEntity.updatedAt;
    dto.authors = caseEntity.authors.map((author) =>
      EmployeeShortDto.fromEntity(author),
    );
    dto.tags = caseEntity.tags.map((tag) => TagShortDto.fromEntity(tag));
    return dto;
  }
}
