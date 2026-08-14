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
import { Roles } from '../../../core/decorators/roles.decorator';
import { CONTENT_ROLES } from '../../../core/enums/role-groups.constant';
import { PaginatedResult } from '../../../core/pagination/paginated-result.interface';
import { ServiceFaqService } from '../application/service-faq.service';
import { CreateServiceFaqDto } from '../dto/create-service-faq.dto';
import { ServiceFaqResponseDto } from '../dto/service-faq-response.dto';
import { UpdateServiceFaqDto } from '../dto/update-service-faq.dto';

// Маршрут сохранён как в старом контракте (`/admin/faq`), хотя внутри — модуль service-faq:
// сущность 1:1 к услуге (serviceId обязателен), не полиморфная, несмотря на общее название.
@Controller('admin/faq')
@Roles(...CONTENT_ROLES)
export class ServiceFaqAdminController {
  constructor(private readonly serviceFaqService: ServiceFaqService) {}

  @Post()
  create(@Body() dto: CreateServiceFaqDto): Promise<ServiceFaqResponseDto> {
    return this.serviceFaqService.create(dto);
  }

  @Get()
  paginate(
    @Query() query: PaginationQueryDto,
  ): Promise<PaginatedResult<ServiceFaqResponseDto>> {
    return this.serviceFaqService.paginate(query.page, query.limit);
  }

  @Get(':id')
  findById(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<ServiceFaqResponseDto> {
    return this.serviceFaqService.findById(id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateServiceFaqDto,
  ): Promise<ServiceFaqResponseDto> {
    return this.serviceFaqService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    await this.serviceFaqService.remove(id);
  }
}
