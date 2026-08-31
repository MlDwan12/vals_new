import { PartialType } from '@nestjs/mapped-types';
import { CreateServiceRelationDto } from './create-service-relation.dto';

// skipNullProperties: false — см. update-service-step.dto.ts (M2 code review).
export class UpdateServiceRelationDto extends PartialType(
  CreateServiceRelationDto,
  { skipNullProperties: false },
) {}
