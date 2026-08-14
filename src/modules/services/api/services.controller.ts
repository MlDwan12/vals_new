import { Controller, Get, Param } from '@nestjs/common';
import { Public } from '../../../core/decorators/public.decorator';
import { ServicesService } from '../application/services.service';
import { ServiceFullInfoDto } from '../dto/service-full-info.dto';
import { ServiceInfoDto } from '../dto/service-info.dto';
import { ServiceListFaqDto } from '../dto/service-list-faq.dto';
import { ServiceShortInfoDto } from '../dto/service-short-info.dto';

@Controller('services')
export class ServicesController {
  constructor(private readonly servicesService: ServicesService) {}

  @Public()
  @Get('all/info')
  findAllInfo(): Promise<ServiceFullInfoDto[]> {
    return this.servicesService.findFullInfoList();
  }

  @Public()
  @Get('all/short-info')
  findAllShortInfo(): Promise<ServiceShortInfoDto[]> {
    return this.servicesService.findShortInfoList();
  }

  @Public()
  @Get('all/full-info')
  findAllFullInfo(): Promise<ServiceFullInfoDto[]> {
    return this.servicesService.findFullInfoList();
  }

  @Public()
  @Get('list/faq')
  findListWithFaq(): Promise<ServiceListFaqDto[]> {
    return this.servicesService.findListWithFaq();
  }

  @Public()
  @Get('info/:slug')
  findBySlug(@Param('slug') slug: string): Promise<ServiceInfoDto> {
    return this.servicesService.findBySlugInfo(slug);
  }
}
