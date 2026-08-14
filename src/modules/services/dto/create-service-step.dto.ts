import { IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';

export class CreateServiceStepDto {
  @IsInt()
  @Min(1)
  step: number;

  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  @IsNotEmpty()
  description: string;

  @IsOptional()
  @IsString()
  time?: string;

  @IsInt()
  @Min(1)
  serviceId: number;
}
