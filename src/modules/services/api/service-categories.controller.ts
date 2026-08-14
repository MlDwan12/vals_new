import { Controller, Get } from '@nestjs/common';
import { Public } from '../../../core/decorators/public.decorator';
import { ServiceCategoriesService } from '../application/service-categories.service';
import { ServiceCategoryResponseDto } from '../dto/service-category-response.dto';

@Controller('service-categories')
export class ServiceCategoriesController {
  constructor(
    private readonly serviceCategoriesService: ServiceCategoriesService,
  ) {}

  @Public()
  @Get()
  findAll(): Promise<ServiceCategoryResponseDto[]> {
    return this.serviceCategoriesService.findAll();
  }
}
