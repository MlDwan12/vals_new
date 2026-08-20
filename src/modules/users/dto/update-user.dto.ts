import {
  IsBoolean,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

// Рукописный DTO (не PartialType от CreateUserDto) — @ValidateIf(value !== undefined), не
// @IsOptional(): все три поля NOT NULL в БД, {"username": null} с @IsOptional() дошёл бы до
// bcrypt/БД и упал 500-й вместо честного 400 (N3, round-2 review; тот же паттерн, что M2 закрыл
// на 13 остальных Update-DTO — этот, единственный рукописный, тогда остался в стороне).
export class UpdateUserDto {
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @MinLength(3)
  @MaxLength(50)
  username?: string;

  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @MinLength(6)
  @MaxLength(100)
  password?: string;

  // Немедленное отключение аккаунта (ТЗ §5) — единственный способ выставить isActive.
  @ValidateIf((_, value) => value !== undefined)
  @IsBoolean()
  isActive?: boolean;
}
