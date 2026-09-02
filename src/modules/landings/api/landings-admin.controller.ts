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
import { PaginatedResult } from '../../../core/pagination/paginated-result.interface';
import { PERMISSIONS } from '../../../core/permissions/permission.registry';
import { LandingsService } from '../application/landings.service';
import { CreateLandingDto } from '../dto/create-landing.dto';
import { LandingListQueryDto } from '../dto/landing-list-query.dto';
import { LandingMainInfoDto } from '../dto/landing-main-info.dto';
import { LandingResponseDto } from '../dto/landing-response.dto';
import { UpdateLandingDto } from '../dto/update-landing.dto';

@Controller('admin/landings')
export class LandingsAdminController {
  constructor(private readonly landingsService: LandingsService) {}

  @Post()
  @Perm(PERMISSIONS.LANDINGS_WRITE)
  create(@Body() dto: CreateLandingDto): Promise<LandingResponseDto> {
    return this.landingsService.create(dto);
  }

  // Реиндексация всего контента — дороже обычных CRUD-операций, отдельный код от LANDINGS_WRITE,
  // выдаётся только admin, не content_manager (тот же прецедент, что у articles/cases/news,
  // code review сессия 29 находка №1).
  @Post('reindex')
  @Perm(PERMISSIONS.SEARCH_REINDEX)
  @HttpCode(HttpStatus.OK)
  reindex(): Promise<void> {
    return this.landingsService.reindexSearch();
  }

  @Get()
  @Perm(PERMISSIONS.LANDINGS_READ)
  findList(
    @Query() query: LandingListQueryDto,
  ): Promise<PaginatedResult<LandingMainInfoDto>> {
    return this.landingsService.findList(query);
  }

  @Get(':id')
  @Perm(PERMISSIONS.LANDINGS_READ)
  findById(@Param('id', ParseIntPipe) id: number): Promise<LandingResponseDto> {
    return this.landingsService.findById(id);
  }

  @Patch(':id')
  @Perm(PERMISSIONS.LANDINGS_WRITE)
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateLandingDto,
  ): Promise<LandingResponseDto> {
    return this.landingsService.update(id, dto);
  }

  @Delete(':id')
  @Perm(PERMISSIONS.LANDINGS_DELETE)
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    await this.landingsService.remove(id);
  }
}
