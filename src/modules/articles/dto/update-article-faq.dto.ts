import { PartialType } from '@nestjs/mapped-types';
import { CreateArticleFaqDto } from './create-article-faq.dto';

export class UpdateArticleFaqDto extends PartialType(CreateArticleFaqDto) {}
