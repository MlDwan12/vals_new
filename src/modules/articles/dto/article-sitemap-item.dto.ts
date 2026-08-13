// Минимальная проекция для sitemap.xml и человекочитаемой карты сайта — без пагинации.
export interface ArticleSitemapItemDto {
  slug: string;
  title: string;
  updatedAt: Date;
}
