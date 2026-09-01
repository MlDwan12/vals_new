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
import { NewsService } from '../application/news.service';
import { CreateNewsDto } from '../dto/create-news.dto';
import { NewsListQueryDto } from '../dto/news-list-query.dto';
import { NewsMainInfoDto } from '../dto/news-main-info.dto';
import { NewsResponseDto } from '../dto/news-response.dto';
import { UpdateNewsDto } from '../dto/update-news.dto';

@Controller('admin/news')
export class NewsAdminController {
  constructor(private readonly newsService: NewsService) {}

  @Post()
  @Perm(PERMISSIONS.NEWS_WRITE)
  create(@Body() dto: CreateNewsDto): Promise<NewsResponseDto> {
    return this.newsService.create(dto);
  }

  // Реиндексация всего контента — дороже обычных CRUD-операций, за ADMIN_ROLES отдельно от общего
  // CONTENT_ROLES контроллера — тот же приём, что у статей/кейсов (M4 code review).
  @Post('reindex')
  @Roles(...ADMIN_ROLES)
  @HttpCode(HttpStatus.OK)
  reindex(): Promise<void> {
    return this.newsService.reindexSearch();
  }

  @Get()
  @Perm(PERMISSIONS.NEWS_READ)
  findList(
    @Query() query: NewsListQueryDto,
  ): Promise<PaginatedResult<NewsMainInfoDto>> {
    return this.newsService.findList(query);
  }

  @Get('all/main-info')
  @Perm(PERMISSIONS.NEWS_READ)
  findAllMainInfo(
    @Query() query: NewsListQueryDto,
  ): Promise<PaginatedResult<NewsMainInfoDto>> {
    return this.newsService.findList(query);
  }

  @Get(':id')
  @Perm(PERMISSIONS.NEWS_READ)
  findById(@Param('id', ParseIntPipe) id: number): Promise<NewsResponseDto> {
    return this.newsService.findById(id);
  }

  @Patch(':id')
  @Perm(PERMISSIONS.NEWS_WRITE)
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateNewsDto,
  ): Promise<NewsResponseDto> {
    return this.newsService.update(id, dto);
  }

  @Delete(':id')
  @Perm(PERMISSIONS.NEWS_DELETE)
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    await this.newsService.remove(id);
  }
}
