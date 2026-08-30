import { Media } from '../domain/media.entity';
import { buildMediaUrl } from '../util/media-url.util';

// Лёгкая проекция медиа — обложка материала (EXPANSION_TASKS.md §4.2: объектом с id/fileName/url/
// alt/width/height, не голым id — потребителю не нужен второй запрос за альтом и размерами).
export class MediaCoverDto {
  id: number;
  fileName: string;
  url: string;
  alt: string | null;
  width: number | null;
  height: number | null;

  static fromEntity(media: Media): MediaCoverDto {
    const dto = new MediaCoverDto();
    dto.id = media.id;
    dto.fileName = media.fileName;
    dto.url = buildMediaUrl(media.fileName);
    dto.alt = media.alt;
    dto.width = media.width;
    dto.height = media.height;
    return dto;
  }
}
