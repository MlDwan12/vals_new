import { User } from '../domain/user.entity';

export class UserResponseDto {
  id: number;
  username: string;
  role: string;
  isActive: boolean;
  accessExpiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;

  static fromEntity(user: User): UserResponseDto {
    const dto = new UserResponseDto();
    dto.id = user.id;
    dto.username = user.username;
    dto.role = user.role.code;
    dto.isActive = user.isActive;
    dto.accessExpiresAt = user.accessExpiresAt;
    dto.createdAt = user.createdAt;
    dto.updatedAt = user.updatedAt;
    return dto;
  }
}
