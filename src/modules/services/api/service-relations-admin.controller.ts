import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { PaginationQueryDto } from '../../../core/dto/pagination-query.dto';
import { Perm } from '../../../core/decorators/perm.decorator';
import { PaginatedResult } from '../../../core/pagination/paginated-result.interface';
import { PERMISSIONS } from '../../../core/permissions/permission.registry';
import { ServiceRelationsService } from '../application/service-relations.service';
import { CreateServiceRelationDto } from '../dto/create-service-relation.dto';
import { ServiceRelationResponseDto } from '../dto/service-relation-response.dto';
import { UpdateServiceRelationDto } from '../dto/update-service-relation.dto';

// Подраздел "Услуги" панели (permission.registry.ts) — гейтится теми же services.*-кодами,
// отдельного service-relations.* в реестре нет.
@Controller('admin/service-relations')
export class ServiceRelationsAdminController {
  constructor(
    private readonly serviceRelationsService: ServiceRelationsService,
  ) {}

  @Post()
  @Perm(PERMISSIONS.SERVICES_WRITE)
  create(
    @Body() dto: CreateServiceRelationDto,
  ): Promise<ServiceRelationResponseDto> {
    return this.serviceRelationsService.create(dto);
  }

  @Get()
  @Perm(PERMISSIONS.SERVICES_READ)
  paginate(
    @Query() query: PaginationQueryDto,
  ): Promise<PaginatedResult<ServiceRelationResponseDto>> {
    return this.serviceRelationsService.paginate(query.page, query.limit);
  }

  @Get(':id')
  @Perm(PERMISSIONS.SERVICES_READ)
  findById(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<ServiceRelationResponseDto> {
    return this.serviceRelationsService.findById(id);
  }

  @Patch(':id')
  @Perm(PERMISSIONS.SERVICES_WRITE)
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateServiceRelationDto,
  ): Promise<ServiceRelationResponseDto> {
    return this.serviceRelationsService.update(id, dto);
  }

  @Delete(':id')
  @Perm(PERMISSIONS.SERVICES_DELETE)
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    await this.serviceRelationsService.remove(id);
  }
}
