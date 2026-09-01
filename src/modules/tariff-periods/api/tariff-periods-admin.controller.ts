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
import { TariffPeriodsService } from '../application/tariff-periods.service';
import { CreateTariffPeriodDto } from '../dto/create-tariff-period.dto';
import { TariffPeriodResponseDto } from '../dto/tariff-period-response.dto';
import { UpdateTariffPeriodDto } from '../dto/update-tariff-period.dto';

// Подраздел "Услуги" панели (permission.registry.ts) — гейтится теми же services.*-кодами,
// отдельного tariff-periods.* в реестре нет.
@Controller('admin/tariff-periods')
export class TariffPeriodsAdminController {
  constructor(private readonly tariffPeriodsService: TariffPeriodsService) {}

  @Post()
  @Perm(PERMISSIONS.SERVICES_WRITE)
  create(@Body() dto: CreateTariffPeriodDto): Promise<TariffPeriodResponseDto> {
    return this.tariffPeriodsService.create(dto);
  }

  @Get()
  @Perm(PERMISSIONS.SERVICES_READ)
  paginate(
    @Query() query: PaginationQueryDto,
  ): Promise<PaginatedResult<TariffPeriodResponseDto>> {
    return this.tariffPeriodsService.paginate(query.page, query.limit);
  }

  @Get(':id')
  @Perm(PERMISSIONS.SERVICES_READ)
  findById(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<TariffPeriodResponseDto> {
    return this.tariffPeriodsService.findById(id);
  }

  @Patch(':id')
  @Perm(PERMISSIONS.SERVICES_WRITE)
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateTariffPeriodDto,
  ): Promise<TariffPeriodResponseDto> {
    return this.tariffPeriodsService.update(id, dto);
  }

  @Delete(':id')
  @Perm(PERMISSIONS.SERVICES_DELETE)
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    await this.tariffPeriodsService.remove(id);
  }
}
