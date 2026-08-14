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
import { IndustriesService } from '../application/industries.service';
import { CreateIndustryDto } from '../dto/create-industry.dto';
import { IndustryResponseDto } from '../dto/industry-response.dto';
import { UpdateIndustryDto } from '../dto/update-industry.dto';

// Путь сохранён из старого контракта в единственном числе (admin/industry) — публичных роутов
// у отраслей нет и не было (ТЗ §4 — контракт воспроизводится один в один).
@Controller('admin/industry')
@Roles(...CONTENT_ROLES)
export class IndustriesAdminController {
  constructor(private readonly industriesService: IndustriesService) {}

  @Post()
  create(@Body() dto: CreateIndustryDto): Promise<IndustryResponseDto> {
    return this.industriesService.create(dto);
  }

  @Get()
  paginate(
    @Query() query: PaginationQueryDto,
  ): Promise<PaginatedResult<IndustryResponseDto>> {
    return this.industriesService.paginate(query.page, query.limit);
  }

  @Get(':id')
  findById(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<IndustryResponseDto> {
    return this.industriesService.findById(id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateIndustryDto,
  ): Promise<IndustryResponseDto> {
    return this.industriesService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    await this.industriesService.remove(id);
  }
}
