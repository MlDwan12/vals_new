import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
} from '@nestjs/common';
import { Perm } from '../../../core/decorators/perm.decorator';
import { PaginatedResult } from '../../../core/pagination/paginated-result.interface';
import { PERMISSIONS } from '../../../core/permissions/permission.registry';
import { ClientLeadsAdminService } from '../application/client-leads-admin.service';
import { ClientLeadListQueryDto } from '../dto/client-lead-list-query.dto';
import { ClientLeadResponseDto } from '../dto/client-lead-response.dto';

@Controller('admin/client-leads')
export class ClientLeadsAdminController {
  constructor(
    private readonly clientLeadsAdminService: ClientLeadsAdminService,
  ) {}

  @Get()
  @Perm(PERMISSIONS.CLIENTS_READ)
  findAndCount(
    @Query() query: ClientLeadListQueryDto,
  ): Promise<PaginatedResult<ClientLeadResponseDto>> {
    return this.clientLeadsAdminService.findAndCount(query);
  }

  @Get('client/:clientId')
  @Perm(PERMISSIONS.CLIENTS_READ)
  findByClientId(
    @Param('clientId', ParseIntPipe) clientId: number,
  ): Promise<ClientLeadResponseDto[]> {
    return this.clientLeadsAdminService.findByClientId(clientId);
  }

  @Get(':id')
  @Perm(PERMISSIONS.CLIENTS_READ)
  findById(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<ClientLeadResponseDto> {
    return this.clientLeadsAdminService.findById(id);
  }

  @Post(':id/retry')
  @Perm(PERMISSIONS.CLIENTS_WRITE)
  retry(@Param('id', ParseIntPipe) id: number): Promise<ClientLeadResponseDto> {
    return this.clientLeadsAdminService.retry(id);
  }
}
