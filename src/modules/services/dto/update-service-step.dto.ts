import { PartialType } from '@nestjs/mapped-types';
import { CreateServiceStepDto } from './create-service-step.dto';

export class UpdateServiceStepDto extends PartialType(CreateServiceStepDto) {}
