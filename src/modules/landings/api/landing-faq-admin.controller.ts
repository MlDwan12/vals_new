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
import { LandingFaqService } from '../application/landing-faq.service';
import { CreateLandingFaqDto } from '../dto/create-landing-faq.dto';
import { LandingFaqResponseDto } from '../dto/landing-faq-response.dto';
import { UpdateLandingFaqDto } from '../dto/update-landing-faq.dto';

@Controller('admin/landing-faq')
@Roles(...CONTENT_ROLES)
export class LandingFaqAdminController {
  constructor(private readonly landingFaqService: LandingFaqService) {}

  @Post()
  create(@Body() dto: CreateLandingFaqDto): Promise<LandingFaqResponseDto> {
    return this.landingFaqService.create(dto);
  }

  @Get()
  paginate(
    @Query() query: PaginationQueryDto,
  ): Promise<PaginatedResult<LandingFaqResponseDto>> {
    return this.landingFaqService.paginate(query.page, query.limit);
  }

  @Get(':id')
  findById(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<LandingFaqResponseDto> {
    return this.landingFaqService.findById(id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateLandingFaqDto,
  ): Promise<LandingFaqResponseDto> {
    return this.landingFaqService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    await this.landingFaqService.remove(id);
  }
}
