// Минимальная проекция для sitemap.xml и человекочитаемой карты сайта — без пагинации. serviceSlug
// обязателен: URL нишевой страницы вложенный (/services/{услуга}/{ниша}, §10 EXPANSION_TASKS.md),
// одного slug'а самой страницы недостаточно для построения адреса.
export interface LandingSitemapItemDto {
  slug: string;
  serviceSlug: string;
  title: string;
  updatedAt: Date;
}
