import { IsDateString, IsInt, IsOptional, Min } from 'class-validator';
import { CreateUserDto } from './create-user.dto';

// Универсальное создание под ЛЮБУЮ роль (в т.ч. новую, заведённую из панели) — EXPANSION_TASKS.md
// §1. Три старых эндпоинта (/admin/users/admins|content-managers|client-managers,
// CreateUserDto) остаются как есть — фронта под перевод на эту ручку в этой сессии нет.
// Наследует username/password-валидацию от CreateUserDto — та же учётка, тот же набор правил.
export class CreateUserWithRoleDto extends CreateUserDto {
  @IsInt()
  @Min(1)
  roleId: number;

  // null — бессрочно (по умолчанию, если не передано).
  @IsOptional()
  @IsDateString()
  accessExpiresAt?: string | null;
}
