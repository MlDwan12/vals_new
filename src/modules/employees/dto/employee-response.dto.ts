import { MediaCoverDto } from '../../media/dto/media-cover.dto';
import { Employee, EmployeeProfileLink } from '../domain/employee.entity';

// Полная проекция — админ-CRUD и персональная страница сотрудника (/employees/info/:slug).
export class EmployeeResponseDto {
  id: number;
  slug: string;
  name: string;
  position: string;
  photo: MediaCoverDto | null;
  shortBio: string | null;
  bio: Record<string, unknown> | null;
  bioHtml: string | null;
  experience: string | null;
  sameAs: EmployeeProfileLink[];
  metaTitle: string | null;
  metaDescription: string | null;
  priority: number;
  isVisible: boolean;

  static fromEntity(employee: Employee): EmployeeResponseDto {
    const dto = new EmployeeResponseDto();
    dto.id = employee.id;
    dto.slug = employee.slug;
    dto.name = employee.name;
    dto.position = employee.position;
    dto.photo = employee.photo
      ? MediaCoverDto.fromEntity(employee.photo)
      : null;
    dto.shortBio = employee.shortBio;
    dto.bio = employee.bio;
    dto.bioHtml = employee.bioHtml;
    dto.experience = employee.experience;
    dto.sameAs = employee.sameAs;
    dto.metaTitle = employee.metaTitle;
    dto.metaDescription = employee.metaDescription;
    dto.priority = employee.priority;
    dto.isVisible = employee.isVisible;
    return dto;
  }
}
