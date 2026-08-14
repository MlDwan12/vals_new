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
import { TariffPeriodsService } from '../application/tariff-periods.service';
import { CreateTariffPeriodDto } from '../dto/create-tariff-period.dto';
import { TariffPeriodResponseDto } from '../dto/tariff-period-response.dto';
import { UpdateTariffPeriodDto } from '../dto/update-tariff-period.dto';

@Controller('admin/tariff-periods')
@Roles(...CONTENT_ROLES)
export class TariffPeriodsAdminController {
  constructor(private readonly tariffPeriodsService: TariffPeriodsService) {}

  @Post()
  create(@Body() dto: CreateTariffPeriodDto): Promise<TariffPeriodResponseDto> {
    return this.tariffPeriodsService.create(dto);
  }

  @Get()
  paginate(
    @Query() query: PaginationQueryDto,
  ): Promise<PaginatedResult<TariffPeriodResponseDto>> {
    return this.tariffPeriodsService.paginate(query.page, query.limit);
  }

  @Get(':id')
  findById(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<TariffPeriodResponseDto> {
    return this.tariffPeriodsService.findById(id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateTariffPeriodDto,
  ): Promise<TariffPeriodResponseDto> {
    return this.tariffPeriodsService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    await this.tariffPeriodsService.remove(id);
  }
}
