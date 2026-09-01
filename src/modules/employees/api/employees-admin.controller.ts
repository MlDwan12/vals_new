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
import { EmployeesService } from '../application/employees.service';
import { CreateEmployeeDto } from '../dto/create-employee.dto';
import { EmployeeMainInfoDto } from '../dto/employee-main-info.dto';
import { EmployeeResponseDto } from '../dto/employee-response.dto';
import { UpdateEmployeeDto } from '../dto/update-employee.dto';

@Controller('admin/employees')
export class EmployeesAdminController {
  constructor(private readonly employeesService: EmployeesService) {}

  @Post()
  @Perm(PERMISSIONS.EMPLOYEES_WRITE)
  create(@Body() dto: CreateEmployeeDto): Promise<EmployeeResponseDto> {
    return this.employeesService.create(dto);
  }

  // Список всех сотрудников (с пагинацией, включая скрытых).
  @Get()
  @Perm(PERMISSIONS.EMPLOYEES_READ)
  paginate(
    @Query() query: PaginationQueryDto,
  ): Promise<PaginatedResult<EmployeeMainInfoDto>> {
    return this.employeesService.paginate(query.page, query.limit);
  }

  @Get(':id')
  @Perm(PERMISSIONS.EMPLOYEES_READ)
  findById(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<EmployeeResponseDto> {
    return this.employeesService.findById(id);
  }

  @Patch(':id')
  @Perm(PERMISSIONS.EMPLOYEES_WRITE)
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateEmployeeDto,
  ): Promise<EmployeeResponseDto> {
    return this.employeesService.update(id, dto);
  }

  @Delete(':id')
  @Perm(PERMISSIONS.EMPLOYEES_DELETE)
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    await this.employeesService.remove(id);
  }
}
