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
import { PaginatedResult } from '../../../core/pagination/paginated-result.interface';
import { PERMISSIONS } from '../../../core/permissions/permission.registry';
import { ClientsAdminService } from '../application/clients-admin.service';
import { ClientListQueryDto } from '../dto/client-list-query.dto';
import { ClientResponseDto } from '../dto/client-response.dto';

@Controller('admin/clients')
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
  @Perm(PERMISSIONS.CLIENTS_DELETE)
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    await this.clientsAdminService.remove(id);
  }
}
