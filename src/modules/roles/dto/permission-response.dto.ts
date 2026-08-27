import { Permission } from '../domain/permission.entity';

export class PermissionResponseDto {
  id: number;
  code: string;
  title: string;
  group: string;

  static fromEntity(permission: Permission): PermissionResponseDto {
    const dto = new PermissionResponseDto();
    dto.id = permission.id;
    dto.code = permission.code;
    dto.title = permission.title;
    dto.group = permission.group;
    return dto;
  }
}
