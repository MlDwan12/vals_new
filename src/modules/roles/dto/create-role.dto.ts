import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

export class CreateRoleDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  @Matches(/^[a-z0-9_]+$/, {
    message:
      'code может содержать только латиницу в нижнем регистре, цифры и подчёркивание',
  })
  code: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  title: string;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsInt()
  @Min(0)
  @Max(1000)
  rank: number;

  // NOT NULL с дефолтом (false) в БД — @IsOptional() пропустил бы явный null мимо валидации
  // (тот же приём, что у priority/hasToc в статьях/кейсах).
  @ValidateIf((_, value) => value !== undefined)
  @IsBoolean()
  isSystem?: boolean;

  @IsArray()
  @ArrayUnique()
  @IsInt({ each: true })
  @IsOptional()
  permissionIds?: number[];
}
