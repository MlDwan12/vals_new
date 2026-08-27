import { Role } from '../domain/role.entity';

export class RoleResponseDto {
  id: number;
  code: string;
  title: string;
  description: string | null;
  rank: number;
  isSystem: boolean;
  permissionCodes: string[];

  static fromEntity(role: Role): RoleResponseDto {
    const dto = new RoleResponseDto();
    dto.id = role.id;
    dto.code = role.code;
    dto.title = role.title;
    dto.description = role.description;
    dto.rank = role.rank;
    dto.isSystem = role.isSystem;
    dto.permissionCodes = role.permissions.map((permission) => permission.code);
    return dto;
  }
}
