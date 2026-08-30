// Минимальная проекция для sitemap.xml и человекочитаемой карты сайта — без пагинации.
export interface NewsSitemapItemDto {
  slug: string;
  title: string;
  updatedAt: Date;
}
