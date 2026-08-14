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
import { Roles } from '../../../core/decorators/roles.decorator';
import { CLIENT_ROLES } from '../../../core/enums/role-groups.constant';
import { PaginatedResult } from '../../../core/pagination/paginated-result.interface';
import { ClientsAdminService } from '../application/clients-admin.service';
import { ClientListQueryDto } from '../dto/client-list-query.dto';
import { ClientResponseDto } from '../dto/client-response.dto';

@Controller('admin/clients')
@Roles(...CLIENT_ROLES)
export class ClientsAdminController {
  constructor(private readonly clientsAdminService: ClientsAdminService) {}

  @Get()
  findAndCount(
    @Query() query: ClientListQueryDto,
  ): Promise<PaginatedResult<ClientResponseDto>> {
    return this.clientsAdminService.findAndCount(query);
  }

  @Get(':id')
  findById(@Param('id', ParseIntPipe) id: number): Promise<ClientResponseDto> {
    return this.clientsAdminService.findById(id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    await this.clientsAdminService.remove(id);
  }
}
