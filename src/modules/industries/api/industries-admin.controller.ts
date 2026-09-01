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
import { IndustriesService } from '../application/industries.service';
import { CreateIndustryDto } from '../dto/create-industry.dto';
import { IndustryResponseDto } from '../dto/industry-response.dto';
import { UpdateIndustryDto } from '../dto/update-industry.dto';

// Путь сохранён из старого контракта в единственном числе (admin/industry) — ТЗ §4, контракт
// админки воспроизводится один в один. Публичные роуты — отдельный IndustriesController (/industries).
// Подраздел "Услуги" панели (permission.registry.ts) — гейтится теми же services.*-кодами,
// отдельного industries.* в реестре нет.
@Controller('admin/industry')
export class IndustriesAdminController {
  constructor(private readonly industriesService: IndustriesService) {}

  @Post()
  @Perm(PERMISSIONS.SERVICES_WRITE)
  create(@Body() dto: CreateIndustryDto): Promise<IndustryResponseDto> {
    return this.industriesService.create(dto);
  }

  @Get()
  @Perm(PERMISSIONS.SERVICES_READ)
  paginate(
    @Query() query: PaginationQueryDto,
  ): Promise<PaginatedResult<IndustryResponseDto>> {
    return this.industriesService.paginate(query.page, query.limit);
  }

  @Get(':id')
  @Perm(PERMISSIONS.SERVICES_READ)
  findById(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<IndustryResponseDto> {
    return this.industriesService.findById(id);
  }

  @Patch(':id')
  @Perm(PERMISSIONS.SERVICES_WRITE)
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateIndustryDto,
  ): Promise<IndustryResponseDto> {
    return this.industriesService.update(id, dto);
  }

  @Delete(':id')
  @Perm(PERMISSIONS.SERVICES_DELETE)
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    await this.industriesService.remove(id);
  }
}
