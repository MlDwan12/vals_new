import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Query,
} from '@nestjs/common';
import { Perm } from '../../../core/decorators/perm.decorator';
import { Roles } from '../../../core/decorators/roles.decorator';
import { CLIENT_ROLES } from '../../../core/enums/role-groups.constant';
import { PaginatedResult } from '../../../core/pagination/paginated-result.interface';
import { PERMISSIONS } from '../../../core/permissions/permission.registry';
import { ClientsAdminService } from '../application/clients-admin.service';
import { ClientListQueryDto } from '../dto/client-list-query.dto';
import { ClientResponseDto } from '../dto/client-response.dto';

// `@Roles(...CLIENT_ROLES)` на контроллере оставлен для `remove` — в реестре прав нет
// clients.write/clients.delete (security-audit-2026-08-31.md, находка №1, задокументированный
// пробел), только на GET-роутах добавлен @Perm(CLIENTS_READ) поверх.
@Controller('admin/clients')
@Roles(...CLIENT_ROLES)
export class ClientsAdminController {
  constructor(private readonly clientsAdminService: ClientsAdminService) {}

  @Get()
  @Perm(PERMISSIONS.CLIENTS_READ)
  findAndCount(
    @Query() query: ClientListQueryDto,
  ): Promise<PaginatedResult<ClientResponseDto>> {
    return this.clientsAdminService.findAndCount(query);
  }

  @Get(':id')
  @Perm(PERMISSIONS.CLIENTS_READ)
  findById(@Param('id', ParseIntPipe) id: number): Promise<ClientResponseDto> {
    return this.clientsAdminService.findById(id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    await this.clientsAdminService.remove(id);
  }
}
