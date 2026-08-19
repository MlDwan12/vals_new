import { buildFaqSearchDocument } from '../../search/application/faq-search-document.util';
import { GlobalSearchDocument } from '../../search/application/global-search-document.interface';
import { Article } from '../domain/article.entity';

type ArticleSearchFields = Pick<
  Article,
  'id' | 'slug' | 'title' | 'description' | 'datePublished'
>;

export function isArticlePublished(article: ArticleSearchFields): boolean {
  return article.datePublished !== null && article.datePublished <= new Date();
}

export function buildArticleSearchDocument(
  article: ArticleSearchFields,
): GlobalSearchDocument {
  return {
    id: `article_${article.id}`,
    entityType: 'article',
    title: article.title,
    description: article.description ?? '',
    url: `/articles/${article.slug}`,
  };
}

export function articleFaqDocumentIds(article: Pick<Article, 'faq'>): string[] {
  return article.faq.map((faq) => `articleFaq_${faq.id}`);
}

// Документы FAQ статьи с актуальным parentUrl (текущий slug) — используется при
// публикации/снятии с публикации/смене slug самой статьи, чтобы FAQ не разъезжались с ней в
// индексе (H6 code review: unpublish снимал только документ статьи, FAQ оставались в выдаче).
export function buildArticleFaqSearchDocuments(
  article: Pick<Article, 'slug' | 'faq'>,
): GlobalSearchDocument[] {
  return article.faq.map((faq) =>
    buildFaqSearchDocument({
      idPrefix: 'articleFaq',
      id: faq.id,
      question: faq.question,
      answer: faq.answer,
      parentUrl: `/articles/${article.slug}`,
    }),
  );
}
