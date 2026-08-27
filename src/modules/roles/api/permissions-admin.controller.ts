import { Controller, Get } from '@nestjs/common';
import { Perm } from '../../../core/decorators/perm.decorator';
import { PERMISSIONS } from '../../../core/permissions/permission.registry';
import { RolesService } from '../application/roles.service';
import { PermissionResponseDto } from '../dto/permission-response.dto';

// Только GET — реестр прав заводится сидом-миграцией, из панели не редактируется
// (EXPANSION_TASKS.md §1.2). Список нужен, чтобы отрисовать чекбоксы при создании/правке роли.
@Controller('admin/permissions')
@Perm(PERMISSIONS.ROLES_MANAGE)
export class PermissionsAdminController {
  constructor(private readonly rolesService: RolesService) {}

  @Get()
  findAll(): Promise<PermissionResponseDto[]> {
    return this.rolesService.findAllPermissions();
  }
}
