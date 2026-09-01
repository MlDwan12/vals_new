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
import { ArticleFaqService } from '../application/article-faq.service';
import { ArticleFaqResponseDto } from '../dto/article-faq-response.dto';
import { CreateArticleFaqDto } from '../dto/create-article-faq.dto';
import { UpdateArticleFaqDto } from '../dto/update-article-faq.dto';

// Подресурс статей (permission.registry.ts) — гейтится теми же articles.*-кодами, отдельного
// article-faq.* в реестре нет.
@Controller('admin/article-faq')
export class ArticleFaqAdminController {
  constructor(private readonly articleFaqService: ArticleFaqService) {}

  @Post()
  @Perm(PERMISSIONS.ARTICLES_WRITE)
  create(@Body() dto: CreateArticleFaqDto): Promise<ArticleFaqResponseDto> {
    return this.articleFaqService.create(dto);
  }

  @Get()
  @Perm(PERMISSIONS.ARTICLES_READ)
  paginate(
    @Query() query: PaginationQueryDto,
  ): Promise<PaginatedResult<ArticleFaqResponseDto>> {
    return this.articleFaqService.paginate(query.page, query.limit);
  }

  @Get(':id')
  @Perm(PERMISSIONS.ARTICLES_READ)
  findById(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<ArticleFaqResponseDto> {
    return this.articleFaqService.findById(id);
  }

  @Patch(':id')
  @Perm(PERMISSIONS.ARTICLES_WRITE)
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateArticleFaqDto,
  ): Promise<ArticleFaqResponseDto> {
    return this.articleFaqService.update(id, dto);
  }

  @Delete(':id')
  @Perm(PERMISSIONS.ARTICLES_DELETE)
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    await this.articleFaqService.remove(id);
  }
}
