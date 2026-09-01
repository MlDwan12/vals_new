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
import { CaseFaqService } from '../application/case-faq.service';
import { CaseFaqResponseDto } from '../dto/case-faq-response.dto';
import { CreateCaseFaqDto } from '../dto/create-case-faq.dto';
import { UpdateCaseFaqDto } from '../dto/update-case-faq.dto';

// Подресурс кейсов (permission.registry.ts) — гейтится теми же cases.*-кодами, отдельного
// case-faq.* в реестре нет.
@Controller('admin/case-faq')
export class CaseFaqAdminController {
  constructor(private readonly caseFaqService: CaseFaqService) {}

  @Post()
  @Perm(PERMISSIONS.CASES_WRITE)
  create(@Body() dto: CreateCaseFaqDto): Promise<CaseFaqResponseDto> {
    return this.caseFaqService.create(dto);
  }

  @Get()
  @Perm(PERMISSIONS.CASES_READ)
  paginate(
    @Query() query: PaginationQueryDto,
  ): Promise<PaginatedResult<CaseFaqResponseDto>> {
    return this.caseFaqService.paginate(query.page, query.limit);
  }

  @Get(':id')
  @Perm(PERMISSIONS.CASES_READ)
  findById(@Param('id', ParseIntPipe) id: number): Promise<CaseFaqResponseDto> {
    return this.caseFaqService.findById(id);
  }

  @Patch(':id')
  @Perm(PERMISSIONS.CASES_WRITE)
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCaseFaqDto,
  ): Promise<CaseFaqResponseDto> {
    return this.caseFaqService.update(id, dto);
  }

  @Delete(':id')
  @Perm(PERMISSIONS.CASES_DELETE)
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    await this.caseFaqService.remove(id);
  }
}
