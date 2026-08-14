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
import { ServiceStepsService } from '../application/service-steps.service';
import { CreateServiceStepDto } from '../dto/create-service-step.dto';
import { ServiceStepResponseDto } from '../dto/service-step-response.dto';
import { UpdateServiceStepDto } from '../dto/update-service-step.dto';

@Controller('admin/service-steps')
@Roles(...CONTENT_ROLES)
export class ServiceStepsAdminController {
  constructor(private readonly serviceStepsService: ServiceStepsService) {}

  @Post()
  create(@Body() dto: CreateServiceStepDto): Promise<ServiceStepResponseDto> {
    return this.serviceStepsService.create(dto);
  }

  @Get()
  paginate(
    @Query() query: PaginationQueryDto,
  ): Promise<PaginatedResult<ServiceStepResponseDto>> {
    return this.serviceStepsService.paginate(query.page, query.limit);
  }

  @Get(':id')
  findById(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<ServiceStepResponseDto> {
    return this.serviceStepsService.findById(id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateServiceStepDto,
  ): Promise<ServiceStepResponseDto> {
    return this.serviceStepsService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    await this.serviceStepsService.remove(id);
  }
}
