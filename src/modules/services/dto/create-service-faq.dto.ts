import { IsInt, IsNotEmpty, IsString, Min } from 'class-validator';

export class CreateServiceFaqDto {
  @IsInt()
  @Min(1)
  serviceId: number;

  @IsString()
  @IsNotEmpty()
  question: string;

  @IsString()
  @IsNotEmpty()
  answer: string;
}
