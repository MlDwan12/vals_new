import { IsInt, IsNotEmpty, IsString } from 'class-validator';

export class CreateArticleFaqDto {
  @IsInt()
  articleId: number;

  @IsString()
  @IsNotEmpty()
  question: string;

  @IsString()
  @IsNotEmpty()
  answer: string;
}
