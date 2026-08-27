import { IsInt, Min } from 'class-validator';

export class ChangeUserRoleDto {
  @IsInt()
  @Min(1)
  roleId: number;
}
