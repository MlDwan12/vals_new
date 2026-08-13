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
import { CaseFaqService } from '../application/case-faq.service';
import { CaseFaqResponseDto } from '../dto/case-faq-response.dto';
import { CreateCaseFaqDto } from '../dto/create-case-faq.dto';
import { UpdateCaseFaqDto } from '../dto/update-case-faq.dto';

@Controller('admin/case-faq')
@Roles(...CONTENT_ROLES)
export class CaseFaqAdminController {
  constructor(private readonly caseFaqService: CaseFaqService) {}

  @Post()
  create(@Body() dto: CreateCaseFaqDto): Promise<CaseFaqResponseDto> {
    return this.caseFaqService.create(dto);
  }

  @Get()
  paginate(
    @Query() query: PaginationQueryDto,
  ): Promise<PaginatedResult<CaseFaqResponseDto>> {
    return this.caseFaqService.paginate(query.page, query.limit);
  }

  @Get(':id')
  findById(@Param('id', ParseIntPipe) id: number): Promise<CaseFaqResponseDto> {
    return this.caseFaqService.findById(id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCaseFaqDto,
  ): Promise<CaseFaqResponseDto> {
    return this.caseFaqService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    await this.caseFaqService.remove(id);
  }
}
