import { IsInt, IsNotEmpty, IsString, Min } from 'class-validator';

export class CreateLandingFaqDto {
  @IsInt()
  @Min(1)
  landingId: number;

  @IsString()
  @IsNotEmpty()
  question: string;

  @IsString()
  @IsNotEmpty()
  answer: string;
}
