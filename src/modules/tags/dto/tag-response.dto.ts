import { Tag } from '../domain/tag.entity';

export class TagResponseDto {
  id: number;
  slug: string;
  name: string;
  priority: number;

  static fromEntity(tag: Tag): TagResponseDto {
    const dto = new TagResponseDto();
    dto.id = tag.id;
    dto.slug = tag.slug;
    dto.name = tag.name;
    dto.priority = tag.priority;
    return dto;
  }
}
