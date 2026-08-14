import { Media } from '../domain/media.entity';

export class MediaResponseDto {
  id: number;
  name: string;
  fileName: string;
  alt: string | null;
  url: string;
  createdAt: Date;

  static fromEntity(media: Media): MediaResponseDto {
    const dto = new MediaResponseDto();
    dto.id = media.id;
    dto.name = media.name;
    dto.fileName = media.fileName;
    dto.alt = media.alt;
    dto.url = `/uploads/media/${media.fileName}`;
    dto.createdAt = media.createdAt;
    return dto;
  }
}
