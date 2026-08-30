import { GlobalSearchDocument } from '../../search/application/global-search-document.interface';
import { News } from '../domain/news.entity';

type NewsSearchFields = Pick<
  News,
  'id' | 'slug' | 'title' | 'announce' | 'datePublished'
>;

export function isNewsPublished(news: NewsSearchFields): boolean {
  return news.datePublished !== null && news.datePublished <= new Date();
}

export function buildNewsSearchDocument(
  news: NewsSearchFields,
): GlobalSearchDocument {
  return {
    id: `news_${news.id}`,
    entityType: 'news',
    title: news.title,
    description: news.announce ?? '',
    url: `/news/${news.slug}`,
  };
}
