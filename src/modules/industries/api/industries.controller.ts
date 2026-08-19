import { Controller, Get, Param } from '@nestjs/common';
import { Public } from '../../../core/decorators/public.decorator';
import { IndustriesService } from '../application/industries.service';
import { IndustryResponseDto } from '../dto/industry-response.dto';

@Controller('industries')
export class IndustriesController {
  constructor(private readonly industriesService: IndustriesService) {}

  @Public()
  @Get('published')
  findPublishedList(): Promise<IndustryResponseDto[]> {
    return this.industriesService.findPublishedList();
  }

  @Public()
  @Get('info/:slug')
  findPublishedBySlug(
    @Param('slug') slug: string,
  ): Promise<IndustryResponseDto> {
    return this.industriesService.findPublishedBySlugOrFail(slug);
  }
}
