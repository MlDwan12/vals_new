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
import { ServiceStepsService } from '../application/service-steps.service';
import { CreateServiceStepDto } from '../dto/create-service-step.dto';
import { ServiceStepResponseDto } from '../dto/service-step-response.dto';
import { UpdateServiceStepDto } from '../dto/update-service-step.dto';

// Подраздел "Услуги" панели (permission.registry.ts) — гейтится теми же services.*-кодами,
// отдельного service-steps.* в реестре нет.
@Controller('admin/service-steps')
export class ServiceStepsAdminController {
  constructor(private readonly serviceStepsService: ServiceStepsService) {}

  @Post()
  @Perm(PERMISSIONS.SERVICES_WRITE)
  create(@Body() dto: CreateServiceStepDto): Promise<ServiceStepResponseDto> {
    return this.serviceStepsService.create(dto);
  }

  @Get()
  @Perm(PERMISSIONS.SERVICES_READ)
  paginate(
    @Query() query: PaginationQueryDto,
  ): Promise<PaginatedResult<ServiceStepResponseDto>> {
    return this.serviceStepsService.paginate(query.page, query.limit);
  }

  @Get(':id')
  @Perm(PERMISSIONS.SERVICES_READ)
  findById(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<ServiceStepResponseDto> {
    return this.serviceStepsService.findById(id);
  }

  @Patch(':id')
  @Perm(PERMISSIONS.SERVICES_WRITE)
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateServiceStepDto,
  ): Promise<ServiceStepResponseDto> {
    return this.serviceStepsService.update(id, dto);
  }

  @Delete(':id')
  @Perm(PERMISSIONS.SERVICES_DELETE)
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    await this.serviceStepsService.remove(id);
  }
}
