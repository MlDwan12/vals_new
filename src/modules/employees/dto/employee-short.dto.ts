import { Employee } from '../domain/employee.entity';

// Лёгкая проекция сотрудника — подпись автора под статьёй/кейсом.
export class EmployeeShortDto {
  id: number;
  slug: string;
  name: string;
  photoUrl: string | null;
  position: string;
  experience: string | null;

  static fromEntity(employee: Employee): EmployeeShortDto {
    const dto = new EmployeeShortDto();
    dto.id = employee.id;
    dto.slug = employee.slug;
    dto.name = employee.name;
    dto.photoUrl = employee.photoUrl;
    dto.position = employee.position;
    dto.experience = employee.experience;
    return dto;
  }
}
