import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateTagDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  slug: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  // порядок тега в списках/фильтре на сайте — не влияет на сортировку статей/кейсов
  @IsOptional()
  @IsInt()
  @Min(0)
  priority?: number;
}
