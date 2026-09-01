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
import { Perm } from '../../../core/decorators/perm.decorator';
import { PaginatedResult } from '../../../core/pagination/paginated-result.interface';
import { PERMISSIONS } from '../../../core/permissions/permission.registry';
import { ServiceFaqService } from '../application/service-faq.service';
import { CreateServiceFaqDto } from '../dto/create-service-faq.dto';
import { ServiceFaqResponseDto } from '../dto/service-faq-response.dto';
import { UpdateServiceFaqDto } from '../dto/update-service-faq.dto';

// Маршрут сохранён как в старом контракте (`/admin/faq`), хотя внутри — модуль service-faq:
// сущность 1:1 к услуге (serviceId обязателен), не полиморфная, несмотря на общее название.
@Controller('admin/faq')
export class ServiceFaqAdminController {
  constructor(private readonly serviceFaqService: ServiceFaqService) {}

  @Post()
  @Perm(PERMISSIONS.SERVICES_WRITE)
  create(@Body() dto: CreateServiceFaqDto): Promise<ServiceFaqResponseDto> {
    return this.serviceFaqService.create(dto);
  }

  @Get()
  @Perm(PERMISSIONS.SERVICES_READ)
  paginate(
    @Query() query: PaginationQueryDto,
  ): Promise<PaginatedResult<ServiceFaqResponseDto>> {
    return this.serviceFaqService.paginate(query.page, query.limit);
  }

  @Get(':id')
  @Perm(PERMISSIONS.SERVICES_READ)
  findById(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<ServiceFaqResponseDto> {
    return this.serviceFaqService.findById(id);
  }

  @Patch(':id')
  @Perm(PERMISSIONS.SERVICES_WRITE)
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateServiceFaqDto,
  ): Promise<ServiceFaqResponseDto> {
    return this.serviceFaqService.update(id, dto);
  }

  @Delete(':id')
  @Perm(PERMISSIONS.SERVICES_DELETE)
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    await this.serviceFaqService.remove(id);
  }
}
