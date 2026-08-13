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
import { ArticleFaqService } from '../application/article-faq.service';
import { ArticleFaqResponseDto } from '../dto/article-faq-response.dto';
import { CreateArticleFaqDto } from '../dto/create-article-faq.dto';
import { UpdateArticleFaqDto } from '../dto/update-article-faq.dto';

@Controller('admin/article-faq')
@Roles(...CONTENT_ROLES)
export class ArticleFaqAdminController {
  constructor(private readonly articleFaqService: ArticleFaqService) {}

  @Post()
  create(@Body() dto: CreateArticleFaqDto): Promise<ArticleFaqResponseDto> {
    return this.articleFaqService.create(dto);
  }

  @Get()
  paginate(
    @Query() query: PaginationQueryDto,
  ): Promise<PaginatedResult<ArticleFaqResponseDto>> {
    return this.articleFaqService.paginate(query.page, query.limit);
  }

  @Get(':id')
  findById(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<ArticleFaqResponseDto> {
    return this.articleFaqService.findById(id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateArticleFaqDto,
  ): Promise<ArticleFaqResponseDto> {
    return this.articleFaqService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    await this.articleFaqService.remove(id);
  }
}
