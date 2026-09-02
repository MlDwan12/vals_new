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
import { LandingFaqService } from '../application/landing-faq.service';
import { CreateLandingFaqDto } from '../dto/create-landing-faq.dto';
import { LandingFaqResponseDto } from '../dto/landing-faq-response.dto';
import { UpdateLandingFaqDto } from '../dto/update-landing-faq.dto';

// Подресурс landings (permission.registry.ts) — гейтится теми же landings.*-кодами, отдельного
// landing-faq.* в реестре нет (тот же приём, что у article-faq/case-faq).
@Controller('admin/landing-faq')
export class LandingFaqAdminController {
  constructor(private readonly landingFaqService: LandingFaqService) {}

  @Post()
  @Perm(PERMISSIONS.LANDINGS_WRITE)
  create(@Body() dto: CreateLandingFaqDto): Promise<LandingFaqResponseDto> {
    return this.landingFaqService.create(dto);
  }

  @Get()
  @Perm(PERMISSIONS.LANDINGS_READ)
  paginate(
    @Query() query: PaginationQueryDto,
  ): Promise<PaginatedResult<LandingFaqResponseDto>> {
    return this.landingFaqService.paginate(query.page, query.limit);
  }

  @Get(':id')
  @Perm(PERMISSIONS.LANDINGS_READ)
  findById(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<LandingFaqResponseDto> {
    return this.landingFaqService.findById(id);
  }

  @Patch(':id')
  @Perm(PERMISSIONS.LANDINGS_WRITE)
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateLandingFaqDto,
  ): Promise<LandingFaqResponseDto> {
    return this.landingFaqService.update(id, dto);
  }

  @Delete(':id')
  @Perm(PERMISSIONS.LANDINGS_DELETE)
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    await this.landingFaqService.remove(id);
  }
}
