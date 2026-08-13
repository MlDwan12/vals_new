import { IsInt, IsNotEmpty, IsString } from 'class-validator';

export class CreateCaseFaqDto {
  @IsInt()
  caseId: number;

  @IsString()
  @IsNotEmpty()
  question: string;

  @IsString()
  @IsNotEmpty()
  answer: string;
}
