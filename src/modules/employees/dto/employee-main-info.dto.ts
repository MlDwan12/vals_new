import { MediaCoverDto } from '../../media/dto/media-cover.dto';
import { Employee } from '../domain/employee.entity';

// Проекция для списков (публичный блок «Команда» и админ-таблица) — без тяжёлых bio/bioHtml/meta.
export class EmployeeMainInfoDto {
  id: number;
  slug: string;
  name: string;
  position: string;
  photo: MediaCoverDto | null;
  shortBio: string | null;
  experience: string | null;
  priority: number;
  isVisible: boolean;
  createdAt: Date;
  updatedAt: Date;

  static fromEntity(employee: Employee): EmployeeMainInfoDto {
    const dto = new EmployeeMainInfoDto();
    dto.id = employee.id;
    dto.slug = employee.slug;
    dto.name = employee.name;
    dto.position = employee.position;
    dto.photo = employee.photo
      ? MediaCoverDto.fromEntity(employee.photo)
      : null;
    dto.shortBio = employee.shortBio;
    dto.experience = employee.experience;
    dto.priority = employee.priority;
    dto.isVisible = employee.isVisible;
    dto.createdAt = employee.createdAt;
    dto.updatedAt = employee.updatedAt;
    return dto;
  }
}
