import { Controller, Get, Param } from '@nestjs/common';
import { Public } from '../../../core/decorators/public.decorator';
import { EmployeesService } from '../application/employees.service';
import { EmployeeMainInfoDto } from '../dto/employee-main-info.dto';
import { EmployeeResponseDto } from '../dto/employee-response.dto';

@Controller('employees')
export class EmployeesController {
  constructor(private readonly employeesService: EmployeesService) {}

  @Public()
  @Get('published')
  findPublishedList(): Promise<EmployeeMainInfoDto[]> {
    return this.employeesService.findPublishedList();
  }

  @Public()
  @Get('info/:slug')
  findPublishedBySlug(
    @Param('slug') slug: string,
  ): Promise<EmployeeResponseDto> {
    return this.employeesService.findPublishedBySlugOrFail(slug);
  }
}
