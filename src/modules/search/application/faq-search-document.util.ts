import { GlobalSearchDocument } from './global-search-document.interface';

const DESCRIPTION_MAX_LENGTH = 200;

// Общий билдер для article_faq/case_faq/service_faq — три структурно идентичные сущности
// (question/answer + родитель), не три копии одной и той же функции.
export function buildFaqSearchDocument(params: {
  idPrefix: 'articleFaq' | 'caseFaq' | 'serviceFaq';
  id: number;
  question: string;
  answer: string;
  parentUrl: string;
}): GlobalSearchDocument {
  return {
    id: `${params.idPrefix}_${params.id}`,
    entityType: 'faq',
    title: params.question,
    description: truncate(params.answer),
    url: params.parentUrl,
  };
}

function truncate(value: string): string {
  const normalized = value.trim();
  if (normalized.length <= DESCRIPTION_MAX_LENGTH) {
    return normalized;
  }
  return `${normalized.slice(0, DESCRIPTION_MAX_LENGTH - 3)}...`;
}
