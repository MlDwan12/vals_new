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
import { Perm } from '../../../core/decorators/perm.decorator';
import { Roles } from '../../../core/decorators/roles.decorator';
import { ADMIN_ROLES } from '../../../core/enums/role-groups.constant';
import { PaginatedResult } from '../../../core/pagination/paginated-result.interface';
import { PERMISSIONS } from '../../../core/permissions/permission.registry';
import { ServicesService } from '../application/services.service';
import { CreateServiceDto } from '../dto/create-service.dto';
import { ServiceFullInfoDto } from '../dto/service-full-info.dto';
import { ServiceListQueryDto } from '../dto/service-list-query.dto';
import { ServiceMainInfoDto } from '../dto/service-main-info.dto';
import { UpdateServiceDto } from '../dto/update-service.dto';

@Controller('admin/services')
export class ServicesAdminController {
  constructor(private readonly servicesService: ServicesService) {}

  @Post()
  @Perm(PERMISSIONS.SERVICES_WRITE)
  create(@Body() dto: CreateServiceDto): Promise<ServiceFullInfoDto> {
    return this.servicesService.create(dto);
  }

  // Реиндексация всего контента — дороже обычных CRUD-операций, старый код держал её за
  // ADMIN_ROLES отдельно от общего CONTENT_ROLES контроллера (M4 code review).
  @Post('reindex')
  @Roles(...ADMIN_ROLES)
  @HttpCode(HttpStatus.OK)
  reindex(): Promise<void> {
    return this.servicesService.reindexSearch();
  }

  @Get()
  @Perm(PERMISSIONS.SERVICES_READ)
  findList(
    @Query() query: ServiceListQueryDto,
  ): Promise<PaginatedResult<ServiceMainInfoDto>> {
    return this.servicesService.findMainInfoList(query);
  }

  @Get('all/main-info')
  @Perm(PERMISSIONS.SERVICES_READ)
  findAllMainInfo(
    @Query() query: ServiceListQueryDto,
  ): Promise<PaginatedResult<ServiceMainInfoDto>> {
    return this.servicesService.findMainInfoList(query);
  }

  @Get(':id')
  @Perm(PERMISSIONS.SERVICES_READ)
  findById(@Param('id', ParseIntPipe) id: number): Promise<ServiceFullInfoDto> {
    return this.servicesService.findById(id);
  }

  @Patch(':id')
  @Perm(PERMISSIONS.SERVICES_WRITE)
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateServiceDto,
  ): Promise<ServiceFullInfoDto> {
    return this.servicesService.update(id, dto);
  }

  @Delete(':id')
  @Perm(PERMISSIONS.SERVICES_DELETE)
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    await this.servicesService.remove(id);
  }
}
