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
import { Roles } from '../../../core/decorators/roles.decorator';
import { ADMIN_ROLES } from '../../../core/enums/role-groups.constant';
import { PaginatedResult } from '../../../core/pagination/paginated-result.interface';
import { PERMISSIONS } from '../../../core/permissions/permission.registry';
import { ArticlesService } from '../application/articles.service';
import { ArticleListQueryDto } from '../dto/article-list-query.dto';
import { ArticleMainInfoDto } from '../dto/article-main-info.dto';
import { ArticleResponseDto } from '../dto/article-response.dto';
import { CreateArticleDto } from '../dto/create-article.dto';
import { UpdateArticleDto } from '../dto/update-article.dto';

@Controller('admin/articles')
export class ArticlesAdminController {
  constructor(private readonly articlesService: ArticlesService) {}

  @Post()
  @Perm(PERMISSIONS.ARTICLES_WRITE)
  create(@Body() dto: CreateArticleDto): Promise<ArticleResponseDto> {
    return this.articlesService.create(dto);
  }

  // Реиндексация всего контента — дороже обычных CRUD-операций, старый код держал её за
  // ADMIN_ROLES отдельно от общего CONTENT_ROLES контроллера (M4 code review).
  @Post('reindex')
  @Roles(...ADMIN_ROLES)
  @HttpCode(HttpStatus.OK)
  reindex(): Promise<void> {
    return this.articlesService.reindexSearch();
  }

  @Get()
  @Perm(PERMISSIONS.ARTICLES_READ)
  findList(
    @Query() query: ArticleListQueryDto,
  ): Promise<PaginatedResult<ArticleMainInfoDto>> {
    return this.articlesService.findList(query);
  }

  @Get('all/main-info')
  @Perm(PERMISSIONS.ARTICLES_READ)
  findAllMainInfo(
    @Query() query: ArticleListQueryDto,
  ): Promise<PaginatedResult<ArticleMainInfoDto>> {
    return this.articlesService.findList(query);
  }

  @Get(':id')
  @Perm(PERMISSIONS.ARTICLES_READ)
  findById(@Param('id', ParseIntPipe) id: number): Promise<ArticleResponseDto> {
    return this.articlesService.findById(id);
  }

  @Patch(':id')
  @Perm(PERMISSIONS.ARTICLES_WRITE)
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateArticleDto,
  ): Promise<ArticleResponseDto> {
    return this.articlesService.update(id, dto);
  }

  @Delete(':id')
  @Perm(PERMISSIONS.ARTICLES_DELETE)
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    await this.articlesService.remove(id);
  }
}
