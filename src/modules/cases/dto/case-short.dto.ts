import { Case } from '../domain/case.entity';

// Лёгкая проекция кейса — для карточки нишевой страницы (связь landings.cases), по образцу
// ServiceShortDto.
export class CaseShortDto {
  id: number;
  slug: string;
  title: string;

  static fromEntity(caseEntity: Case): CaseShortDto {
    const dto = new CaseShortDto();
    dto.id = caseEntity.id;
    dto.slug = caseEntity.slug;
    dto.title = caseEntity.title;
    return dto;
  }
}
