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
import { TariffsService } from '../application/tariffs.service';
import { CreateTariffDto } from '../dto/create-tariff.dto';
import { TariffResponseDto } from '../dto/tariff-response.dto';
import { UpdateTariffDto } from '../dto/update-tariff.dto';

// Подраздел "Услуги" панели (permission.registry.ts) — гейтится теми же services.*-кодами,
// отдельного tariffs.* в реестре нет.
@Controller('admin/tariffs')
export class TariffsAdminController {
  constructor(private readonly tariffsService: TariffsService) {}

  @Post()
  @Perm(PERMISSIONS.SERVICES_WRITE)
  create(@Body() dto: CreateTariffDto): Promise<TariffResponseDto> {
    return this.tariffsService.create(dto);
  }

  @Get()
  @Perm(PERMISSIONS.SERVICES_READ)
  paginate(
    @Query() query: PaginationQueryDto,
  ): Promise<PaginatedResult<TariffResponseDto>> {
    return this.tariffsService.paginate(query.page, query.limit);
  }

  @Get(':id')
  @Perm(PERMISSIONS.SERVICES_READ)
  findById(@Param('id', ParseIntPipe) id: number): Promise<TariffResponseDto> {
    return this.tariffsService.findById(id);
  }

  @Patch(':id')
  @Perm(PERMISSIONS.SERVICES_WRITE)
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateTariffDto,
  ): Promise<TariffResponseDto> {
    return this.tariffsService.update(id, dto);
  }

  @Delete(':id')
  @Perm(PERMISSIONS.SERVICES_DELETE)
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    await this.tariffsService.remove(id);
  }
}
