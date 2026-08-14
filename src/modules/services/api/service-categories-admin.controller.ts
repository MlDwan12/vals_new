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
import { Roles } from '../../../core/decorators/roles.decorator';
import { CONTENT_ROLES } from '../../../core/enums/role-groups.constant';
import { PaginatedResult } from '../../../core/pagination/paginated-result.interface';
import { ServiceCategoriesService } from '../application/service-categories.service';
import { CreateServiceCategoryDto } from '../dto/create-service-category.dto';
import { ServiceCategoryResponseDto } from '../dto/service-category-response.dto';
import { UpdateServiceCategoryDto } from '../dto/update-service-category.dto';

@Controller('admin/service-categories')
@Roles(...CONTENT_ROLES)
export class ServiceCategoriesAdminController {
  constructor(
    private readonly serviceCategoriesService: ServiceCategoriesService,
  ) {}

  @Post()
  create(
    @Body() dto: CreateServiceCategoryDto,
  ): Promise<ServiceCategoryResponseDto> {
    return this.serviceCategoriesService.create(dto);
  }

  @Get()
  paginate(
    @Query() query: PaginationQueryDto,
  ): Promise<PaginatedResult<ServiceCategoryResponseDto>> {
    return this.serviceCategoriesService.paginate(query.page, query.limit);
  }

  @Get(':id')
  findById(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<ServiceCategoryResponseDto> {
    return this.serviceCategoriesService.findById(id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateServiceCategoryDto,
  ): Promise<ServiceCategoryResponseDto> {
    return this.serviceCategoriesService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    await this.serviceCategoriesService.remove(id);
  }
}
