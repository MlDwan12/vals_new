import { buildFaqSearchDocument } from '../../search/application/faq-search-document.util';
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

// Документы FAQ кейса с актуальным parentUrl — используется при публикации/снятии с публикации/
// смене slug самого кейса, чтобы FAQ не расходился с ним в индексе (H6).
export function buildCaseFaqSearchDocuments(
  caseEntity: Pick<Case, 'slug' | 'faq'>,
): GlobalSearchDocument[] {
  return caseEntity.faq.map((faq) =>
    buildFaqSearchDocument({
      idPrefix: 'caseFaq',
      id: faq.id,
      question: faq.question,
      answer: faq.answer,
      parentUrl: `/cases/${caseEntity.slug}`,
    }),
  );
}
