import { PartialType } from '@nestjs/mapped-types';
import { CreateCaseFaqDto } from './create-case-faq.dto';

export class UpdateCaseFaqDto extends PartialType(CreateCaseFaqDto) {}
