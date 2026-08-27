import { PartialType } from '@nestjs/mapped-types';
import { CreateRoleDto } from './create-role.dto';

// skipNullProperties: false — см. update-article-faq.dto.ts (M2 code review): description
// принимает явный null (снять описание), isSystem — NOT NULL, явный null должен остаться ошибкой
// валидации, а не молча отброситься как "не задано".
export class UpdateRoleDto extends PartialType(CreateRoleDto, {
  skipNullProperties: false,
}) {}
