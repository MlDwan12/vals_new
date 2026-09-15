import { IsEnum, IsUrl, MaxLength } from 'class-validator';
import { EmployeeProfileType } from '../enums/employee-profile-type.enum';

// Один внешний профиль сотрудника: площадка + ссылка. Ссылка только http(s) — сайт выводит её
// в href, javascript:/data: сюда попадать не должны.
export class EmployeeProfileLinkDto {
  @IsEnum(EmployeeProfileType)
  type: EmployeeProfileType;

  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  @MaxLength(2048)
  url: string;
}
