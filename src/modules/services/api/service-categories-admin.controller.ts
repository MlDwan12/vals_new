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
import { ServiceCategoriesService } from '../application/service-categories.service';
import { CreateServiceCategoryDto } from '../dto/create-service-category.dto';
import { ServiceCategoryResponseDto } from '../dto/service-category-response.dto';
import { UpdateServiceCategoryDto } from '../dto/update-service-category.dto';

// Подраздел "Услуги" панели (permission.registry.ts) — гейтится теми же services.*-кодами,
// отдельного service-categories.* в реестре нет.
@Controller('admin/service-categories')
export class ServiceCategoriesAdminController {
  constructor(
    private readonly serviceCategoriesService: ServiceCategoriesService,
  ) {}

  @Post()
  @Perm(PERMISSIONS.SERVICES_WRITE)
  create(
    @Body() dto: CreateServiceCategoryDto,
  ): Promise<ServiceCategoryResponseDto> {
    return this.serviceCategoriesService.create(dto);
  }

  @Get()
  @Perm(PERMISSIONS.SERVICES_READ)
  paginate(
    @Query() query: PaginationQueryDto,
  ): Promise<PaginatedResult<ServiceCategoryResponseDto>> {
    return this.serviceCategoriesService.paginate(query.page, query.limit);
  }

  @Get(':id')
  @Perm(PERMISSIONS.SERVICES_READ)
  findById(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<ServiceCategoryResponseDto> {
    return this.serviceCategoriesService.findById(id);
  }

  @Patch(':id')
  @Perm(PERMISSIONS.SERVICES_WRITE)
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateServiceCategoryDto,
  ): Promise<ServiceCategoryResponseDto> {
    return this.serviceCategoriesService.update(id, dto);
  }

  @Delete(':id')
  @Perm(PERMISSIONS.SERVICES_DELETE)
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    await this.serviceCategoriesService.remove(id);
  }
}
