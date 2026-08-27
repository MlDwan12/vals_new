import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

// Границы совпадают с CreateUserDto (users/dto/create-user.dto.ts) — учётка не может быть создана
// длиннее этого, значит и логин длиннее этого гарантированно невалиден. Без верхней границы —
// Б2, независимый аудит 2026-08-21: LoginUsernameThrottleGuard читает body.username ДО этого DTO
// (guard'ы выполняются раньше pipes) и использует как ключ BoundedTtlMap, там же отдельно обрезано.
export class LoginDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  username: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  password: string;
}
