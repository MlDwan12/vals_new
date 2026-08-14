import { PartialType } from '@nestjs/mapped-types';
import { CreateServiceFaqDto } from './create-service-faq.dto';

export class UpdateServiceFaqDto extends PartialType(CreateServiceFaqDto) {}
