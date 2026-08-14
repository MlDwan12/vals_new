export interface TagWithCountsRow {
  id: number;
  slug: string;
  name: string;
  priority: number;
  articlesCount: number;
  casesCount: number;
}

// Проекция для админ-таблицы — тегов мало, пагинация там не нужна (см. TagsRepository.findAllWithCounts).
export class TagWithCountsResponseDto {
  id: number;
  slug: string;
  name: string;
  priority: number;
  articlesCount: number;
  casesCount: number;

  static fromRow(row: TagWithCountsRow): TagWithCountsResponseDto {
    const dto = new TagWithCountsResponseDto();
    dto.id = row.id;
    dto.slug = row.slug;
    dto.name = row.name;
    dto.priority = row.priority;
    dto.articlesCount = row.articlesCount;
    dto.casesCount = row.casesCount;
    return dto;
  }
}
