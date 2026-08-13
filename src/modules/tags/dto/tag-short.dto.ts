import { Tag } from '../domain/tag.entity';

// Лёгкая проекция тега — джойн к статьям/кейсам и публичный список для фильтра.
export class TagShortDto {
  id: number;
  slug: string;
  name: string;
  priority: number;

  static fromEntity(tag: Tag): TagShortDto {
    const dto = new TagShortDto();
    dto.id = tag.id;
    dto.slug = tag.slug;
    dto.name = tag.name;
    dto.priority = tag.priority;
    return dto;
  }
}
