import { Controller, Get, Param, ParseIntPipe, Query } from '@nestjs/common';
import { PaginationQueryDto } from '../../../core/dto/pagination-query.dto';
import { Perm } from '../../../core/decorators/perm.decorator';
import { PaginatedResult } from '../../../core/pagination/paginated-result.interface';
import { PERMISSIONS } from '../../../core/permissions/permission.registry';
import { ClientContactsAdminService } from '../application/client-contacts-admin.service';
import { ClientContactResponseDto } from '../dto/client-contact-response.dto';

@Controller('admin/client-contacts')
@Perm(PERMISSIONS.CLIENTS_READ)
export class ClientContactsAdminController {
  constructor(
    private readonly clientContactsAdminService: ClientContactsAdminService,
  ) {}

  @Get()
  findAndCount(
    @Query() query: PaginationQueryDto,
  ): Promise<PaginatedResult<ClientContactResponseDto>> {
    return this.clientContactsAdminService.findAndCount(query);
  }

  @Get('client/:clientId')
  findByClientId(
    @Param('clientId', ParseIntPipe) clientId: number,
  ): Promise<ClientContactResponseDto[]> {
    return this.clientContactsAdminService.findByClientId(clientId);
  }

  @Get(':id')
  findById(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<ClientContactResponseDto> {
    return this.clientContactsAdminService.findById(id);
  }
}
