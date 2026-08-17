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
