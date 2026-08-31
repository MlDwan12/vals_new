export type SearchEntityType =
  'article' | 'case' | 'service' | 'news' | 'landing' | 'faq';

// Документ индекса Meilisearch — умышленно только то, что реально показывается в выдаче поиска
// (карточка результата: заголовок, описание, ссылка). Раздутые поля старого документа (content,
// tags, category, isPublished, createdAt/updatedAt) в старом коде были объявлены, но никогда не
// заполнялись — здесь их просто нет, а не "заполнить наконец".
export interface GlobalSearchDocument {
  id: string;
  entityType: SearchEntityType;
  title: string;
  description: string;
  url: string;
}
