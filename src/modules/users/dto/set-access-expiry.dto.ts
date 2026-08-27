import { IsDateString, ValidateIf } from 'class-validator';

// Поле обязательно в теле (не @IsOptional() — у этой ручки нет смысла "ничего не менять"),
// но принимает null явно ("снять срок, сделать бессрочным").
export class SetAccessExpiryDto {
  @ValidateIf((_, value) => value !== null)
  @IsDateString()
  accessExpiresAt: string | null;
}
