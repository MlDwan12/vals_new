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
import { NewsService } from '../application/news.service';
import { CreateNewsDto } from '../dto/create-news.dto';
import { NewsListQueryDto } from '../dto/news-list-query.dto';
import { NewsMainInfoDto } from '../dto/news-main-info.dto';
import { NewsResponseDto } from '../dto/news-response.dto';
import { UpdateNewsDto } from '../dto/update-news.dto';

@Controller('admin/news')
@Roles(...CONTENT_ROLES)
export class NewsAdminController {
  constructor(private readonly newsService: NewsService) {}

  @Post()
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
  findList(
    @Query() query: NewsListQueryDto,
  ): Promise<PaginatedResult<NewsMainInfoDto>> {
    return this.newsService.findList(query);
  }

  @Get('all/main-info')
  findAllMainInfo(
    @Query() query: NewsListQueryDto,
  ): Promise<PaginatedResult<NewsMainInfoDto>> {
    return this.newsService.findList(query);
  }

  @Get(':id')
  findById(@Param('id', ParseIntPipe) id: number): Promise<NewsResponseDto> {
    return this.newsService.findById(id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateNewsDto,
  ): Promise<NewsResponseDto> {
    return this.newsService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    await this.newsService.remove(id);
  }
}
