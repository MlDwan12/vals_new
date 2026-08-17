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
import { CONTENT_ROLES } from '../../../core/enums/role-groups.constant';
import { PaginatedResult } from '../../../core/pagination/paginated-result.interface';
import { ArticlesService } from '../application/articles.service';
import { ArticleListQueryDto } from '../dto/article-list-query.dto';
import { ArticleMainInfoDto } from '../dto/article-main-info.dto';
import { ArticleResponseDto } from '../dto/article-response.dto';
import { CreateArticleDto } from '../dto/create-article.dto';
import { UpdateArticleDto } from '../dto/update-article.dto';

@Controller('admin/articles')
@Roles(...CONTENT_ROLES)
export class ArticlesAdminController {
  constructor(private readonly articlesService: ArticlesService) {}

  @Post()
  create(@Body() dto: CreateArticleDto): Promise<ArticleResponseDto> {
    return this.articlesService.create(dto);
  }

  @Post('reindex')
  @HttpCode(HttpStatus.OK)
  reindex(): Promise<void> {
    return this.articlesService.reindexSearch();
  }

  @Get()
  findList(
    @Query() query: ArticleListQueryDto,
  ): Promise<PaginatedResult<ArticleMainInfoDto>> {
    return this.articlesService.findList(query);
  }

  @Get('all/main-info')
  findAllMainInfo(
    @Query() query: ArticleListQueryDto,
  ): Promise<PaginatedResult<ArticleMainInfoDto>> {
    return this.articlesService.findList(query);
  }

  @Get(':id')
  findById(@Param('id', ParseIntPipe) id: number): Promise<ArticleResponseDto> {
    return this.articlesService.findById(id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateArticleDto,
  ): Promise<ArticleResponseDto> {
    return this.articlesService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    await this.articlesService.remove(id);
  }
}
