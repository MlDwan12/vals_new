import { Controller, Get, Param } from '@nestjs/common';
import { Public } from '../../../core/decorators/public.decorator';
import { LandingsService } from '../application/landings.service';
import { LandingResponseDto } from '../dto/landing-response.dto';
import { LandingSitemapItemDto } from '../dto/landing-sitemap-item.dto';

@Controller('landings')
export class LandingsController {
  constructor(private readonly landingsService: LandingsService) {}

  @Public()
  @Get('published/all')
  findAllPublishedSitemapItems(): Promise<LandingSitemapItemDto[]> {
    return this.landingsService.findAllPublishedSitemapItems();
  }

  // URL составной (slug услуги + slug ниши) — глобально уникален только slug услуги, slug самой
  // страницы уникален лишь в её пределах (§10.2 expansion-decisions.md).
  @Public()
  @Get('info/:serviceSlug/:slug')
  findBySlug(
    @Param('serviceSlug') serviceSlug: string,
    @Param('slug') slug: string,
  ): Promise<LandingResponseDto> {
    return this.landingsService.findBySlugPublished(serviceSlug, slug);
  }
}
