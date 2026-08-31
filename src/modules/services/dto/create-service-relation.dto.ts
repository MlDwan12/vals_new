import { IsInt, Min } from 'class-validator';

export class CreateServiceRelationDto {
  @IsInt()
  @Min(1)
  serviceId: number;

  @IsInt()
  @Min(1)
  relatedServiceId: number;

  @IsInt()
  @Min(1)
  order: number;
}
