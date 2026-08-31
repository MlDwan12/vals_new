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
import { Roles } from '../../../core/decorators/roles.decorator';
import {
  ADMIN_ROLES,
  CONTENT_ROLES,
} from '../../../core/enums/role-groups.constant';
import { PaginatedResult } from '../../../core/pagination/paginated-result.interface';
import { LandingsService } from '../application/landings.service';
import { CreateLandingDto } from '../dto/create-landing.dto';
import { LandingListQueryDto } from '../dto/landing-list-query.dto';
import { LandingMainInfoDto } from '../dto/landing-main-info.dto';
import { LandingResponseDto } from '../dto/landing-response.dto';
import { UpdateLandingDto } from '../dto/update-landing.dto';

@Controller('admin/landings')
@Roles(...CONTENT_ROLES)
export class LandingsAdminController {
  constructor(private readonly landingsService: LandingsService) {}

  @Post()
  create(@Body() dto: CreateLandingDto): Promise<LandingResponseDto> {
    return this.landingsService.create(dto);
  }

  // Реиндексация всего контента — дороже обычных CRUD-операций, держим за ADMIN_ROLES отдельно от
  // общего CONTENT_ROLES контроллера (тот же прецедент, что у articles/cases/news).
  @Post('reindex')
  @Roles(...ADMIN_ROLES)
  @HttpCode(HttpStatus.OK)
  reindex(): Promise<void> {
    return this.landingsService.reindexSearch();
  }

  @Get()
  findList(
    @Query() query: LandingListQueryDto,
  ): Promise<PaginatedResult<LandingMainInfoDto>> {
    return this.landingsService.findList(query);
  }

  @Get(':id')
  findById(@Param('id', ParseIntPipe) id: number): Promise<LandingResponseDto> {
    return this.landingsService.findById(id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateLandingDto,
  ): Promise<LandingResponseDto> {
    return this.landingsService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    await this.landingsService.remove(id);
  }
}
