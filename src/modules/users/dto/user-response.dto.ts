import { User } from '../domain/user.entity';

export class UserResponseDto {
  id: number;
  username: string;
  role: string;
  // Роль разложена полями, а не одним кодом: панели нужен id (предвыбрать в списке смены роли),
  // название (коды ролей из панели произвольны), ранг и is_system — по ним фронт решает, можно
  // ли вообще предлагать действия над этой учёткой (те же canManageTargetUser/canAssignRole,
  // что проверит бек). Relation role уже загружается во всех выборках этого DTO.
  roleId: number;
  roleTitle: string;
  roleRank: number;
  roleIsSystem: boolean;
  isActive: boolean;
  accessExpiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;

  static fromEntity(user: User): UserResponseDto {
    const dto = new UserResponseDto();
    dto.id = user.id;
    dto.username = user.username;
    dto.role = user.role.code;
    dto.roleId = user.role.id;
    dto.roleTitle = user.role.title;
    dto.roleRank = user.role.rank;
    dto.roleIsSystem = user.role.isSystem;
    dto.isActive = user.isActive;
    dto.accessExpiresAt = user.accessExpiresAt;
    dto.createdAt = user.createdAt;
    dto.updatedAt = user.updatedAt;
    return dto;
  }
}
