import { Media } from '../domain/media.entity';
import { buildMediaUrl } from '../util/media-url.util';

export class MediaResponseDto {
  id: number;
  name: string;
  fileName: string;
  alt: string | null;
  url: string;
  width: number | null;
  height: number | null;
  mimeType: string | null;
  sizeBytes: number | null;
  createdAt: Date;

  static fromEntity(media: Media): MediaResponseDto {
    const dto = new MediaResponseDto();
    dto.id = media.id;
    dto.name = media.name;
    dto.fileName = media.fileName;
    dto.alt = media.alt;
    dto.url = buildMediaUrl(media.fileName);
    dto.width = media.width;
    dto.height = media.height;
    dto.mimeType = media.mimeType;
    dto.sizeBytes = media.sizeBytes;
    dto.createdAt = media.createdAt;
    return dto;
  }
}
