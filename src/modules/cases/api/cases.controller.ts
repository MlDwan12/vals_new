import { Controller, Get, Param, Query } from '@nestjs/common';
import { Public } from '../../../core/decorators/public.decorator';
import { PaginatedResult } from '../../../core/pagination/paginated-result.interface';
import { CasesService } from '../application/cases.service';
import { CaseListQueryDto } from '../dto/case-list-query.dto';
import { CaseMainInfoDto } from '../dto/case-main-info.dto';
import { CaseResponseDto } from '../dto/case-response.dto';
import { CaseSitemapItemDto } from '../dto/case-sitemap-item.dto';
import { SimilarCasesQueryDto } from '../dto/similar-cases-query.dto';

@Controller('cases')
export class CasesController {
  constructor(private readonly casesService: CasesService) {}

  @Public()
  @Get('similar')
  findSimilar(
    @Query() query: SimilarCasesQueryDto,
  ): Promise<CaseMainInfoDto[]> {
    return this.casesService.findSimilarPublished(
      query.tagIds,
      query.excludeId,
      query.limit,
    );
  }

  @Public()
  @Get('published/main-info')
  findPublishedList(
    @Query() query: CaseListQueryDto,
  ): Promise<PaginatedResult<CaseMainInfoDto>> {
    return this.casesService.findPublishedList(query);
  }

  @Public()
  @Get('published/all')
  findAllPublishedSitemapItems(): Promise<CaseSitemapItemDto[]> {
    return this.casesService.findAllPublishedSitemapItems();
  }

  @Public()
  @Get('service/:slug')
  findPublishedByServiceSlug(
    @Param('slug') slug: string,
  ): Promise<CaseMainInfoDto[]> {
    return this.casesService.findPublishedByServiceSlug(slug);
  }

  @Public()
  @Get('info/case/:slug')
  findBySlug(@Param('slug') slug: string): Promise<CaseResponseDto> {
    return this.casesService.findBySlugPublished(slug);
  }
}
