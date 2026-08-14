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
import { EmployeesService } from '../application/employees.service';
import { CreateEmployeeDto } from '../dto/create-employee.dto';
import { EmployeeMainInfoDto } from '../dto/employee-main-info.dto';
import { EmployeeResponseDto } from '../dto/employee-response.dto';
import { UpdateEmployeeDto } from '../dto/update-employee.dto';

@Controller('admin/employees')
@Roles(...CONTENT_ROLES)
export class EmployeesAdminController {
  constructor(private readonly employeesService: EmployeesService) {}

  @Post()
  create(@Body() dto: CreateEmployeeDto): Promise<EmployeeResponseDto> {
    return this.employeesService.create(dto);
  }

  // Список всех сотрудников (с пагинацией, включая скрытых).
  @Get()
  paginate(
    @Query() query: PaginationQueryDto,
  ): Promise<PaginatedResult<EmployeeMainInfoDto>> {
    return this.employeesService.paginate(query.page, query.limit);
  }

  @Get(':id')
  findById(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<EmployeeResponseDto> {
    return this.employeesService.findById(id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateEmployeeDto,
  ): Promise<EmployeeResponseDto> {
    return this.employeesService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    await this.employeesService.remove(id);
  }
}
