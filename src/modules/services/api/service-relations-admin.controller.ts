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
import { ServiceRelationsService } from '../application/service-relations.service';
import { CreateServiceRelationDto } from '../dto/create-service-relation.dto';
import { ServiceRelationResponseDto } from '../dto/service-relation-response.dto';
import { UpdateServiceRelationDto } from '../dto/update-service-relation.dto';

@Controller('admin/service-relations')
@Roles(...CONTENT_ROLES)
export class ServiceRelationsAdminController {
  constructor(
    private readonly serviceRelationsService: ServiceRelationsService,
  ) {}

  @Post()
  create(
    @Body() dto: CreateServiceRelationDto,
  ): Promise<ServiceRelationResponseDto> {
    return this.serviceRelationsService.create(dto);
  }

  @Get()
  paginate(
    @Query() query: PaginationQueryDto,
  ): Promise<PaginatedResult<ServiceRelationResponseDto>> {
    return this.serviceRelationsService.paginate(query.page, query.limit);
  }

  @Get(':id')
  findById(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<ServiceRelationResponseDto> {
    return this.serviceRelationsService.findById(id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateServiceRelationDto,
  ): Promise<ServiceRelationResponseDto> {
    return this.serviceRelationsService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    await this.serviceRelationsService.remove(id);
  }
}
