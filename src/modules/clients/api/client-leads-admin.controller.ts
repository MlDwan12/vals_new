import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
} from '@nestjs/common';
import { Roles } from '../../../core/decorators/roles.decorator';
import { CLIENT_ROLES } from '../../../core/enums/role-groups.constant';
import { PaginatedResult } from '../../../core/pagination/paginated-result.interface';
import { ClientLeadsAdminService } from '../application/client-leads-admin.service';
import { ClientLeadListQueryDto } from '../dto/client-lead-list-query.dto';
import { ClientLeadResponseDto } from '../dto/client-lead-response.dto';

@Controller('admin/client-leads')
@Roles(...CLIENT_ROLES)
export class ClientLeadsAdminController {
  constructor(
    private readonly clientLeadsAdminService: ClientLeadsAdminService,
  ) {}

  @Get()
  findAndCount(
    @Query() query: ClientLeadListQueryDto,
  ): Promise<PaginatedResult<ClientLeadResponseDto>> {
    return this.clientLeadsAdminService.findAndCount(query);
  }

  @Get('client/:clientId')
  findByClientId(
    @Param('clientId', ParseIntPipe) clientId: number,
  ): Promise<ClientLeadResponseDto[]> {
    return this.clientLeadsAdminService.findByClientId(clientId);
  }

  @Get(':id')
  findById(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<ClientLeadResponseDto> {
    return this.clientLeadsAdminService.findById(id);
  }

  @Post(':id/retry')
  retry(@Param('id', ParseIntPipe) id: number): Promise<ClientLeadResponseDto> {
    return this.clientLeadsAdminService.retry(id);
  }
}
