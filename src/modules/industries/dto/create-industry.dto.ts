import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateIndustryDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  name: string;
}
