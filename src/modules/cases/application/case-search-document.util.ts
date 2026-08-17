import { GlobalSearchDocument } from '../../search/application/global-search-document.interface';
import { Case } from '../domain/case.entity';

type CaseSearchFields = Pick<
  Case,
  'id' | 'slug' | 'title' | 'description' | 'datePublished'
>;

export function isCasePublished(caseEntity: CaseSearchFields): boolean {
  return (
    caseEntity.datePublished !== null && caseEntity.datePublished <= new Date()
  );
}

export function buildCaseSearchDocument(
  caseEntity: CaseSearchFields,
): GlobalSearchDocument {
  return {
    id: `case_${caseEntity.id}`,
    entityType: 'case',
    title: caseEntity.title,
    description: caseEntity.description ?? '',
    url: `/cases/${caseEntity.slug}`,
  };
}

export function caseFaqDocumentIds(caseEntity: Pick<Case, 'faq'>): string[] {
  return caseEntity.faq.map((faq) => `caseFaq_${faq.id}`);
}
