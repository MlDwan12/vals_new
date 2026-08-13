import {
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(50)
  username?: string;

  @IsOptional()
  @IsString()
  @MinLength(6)
  @MaxLength(100)
  password?: string;

  // Немедленное отключение аккаунта (ТЗ §5) — единственный способ выставить isActive.
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
