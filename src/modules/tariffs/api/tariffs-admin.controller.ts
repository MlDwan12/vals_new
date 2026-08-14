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
import { TariffsService } from '../application/tariffs.service';
import { CreateTariffDto } from '../dto/create-tariff.dto';
import { TariffResponseDto } from '../dto/tariff-response.dto';
import { UpdateTariffDto } from '../dto/update-tariff.dto';

@Controller('admin/tariffs')
@Roles(...CONTENT_ROLES)
export class TariffsAdminController {
  constructor(private readonly tariffsService: TariffsService) {}

  @Post()
  create(@Body() dto: CreateTariffDto): Promise<TariffResponseDto> {
    return this.tariffsService.create(dto);
  }

  @Get()
  paginate(
    @Query() query: PaginationQueryDto,
  ): Promise<PaginatedResult<TariffResponseDto>> {
    return this.tariffsService.paginate(query.page, query.limit);
  }

  @Get(':id')
  findById(@Param('id', ParseIntPipe) id: number): Promise<TariffResponseDto> {
    return this.tariffsService.findById(id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateTariffDto,
  ): Promise<TariffResponseDto> {
    return this.tariffsService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    await this.tariffsService.remove(id);
  }
}
