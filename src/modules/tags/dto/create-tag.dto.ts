import {
  IsInt,
  IsNotEmpty,
  IsString,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

export class CreateTagDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  // порядок тега в списках/фильтре на сайте — не влияет на сортировку статей/кейсов. NOT NULL с
  // дефолтом в БД — @IsOptional() пропустил бы явный null мимо валидации на PATCH (code review).
  @ValidateIf((_, value) => value !== undefined)
  @IsInt()
  @Min(0)
  priority?: number;
}
