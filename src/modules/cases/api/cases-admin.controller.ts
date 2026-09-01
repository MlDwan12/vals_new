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
import { Perm } from '../../../core/decorators/perm.decorator';
import { Roles } from '../../../core/decorators/roles.decorator';
import { ADMIN_ROLES } from '../../../core/enums/role-groups.constant';
import { PaginatedResult } from '../../../core/pagination/paginated-result.interface';
import { PERMISSIONS } from '../../../core/permissions/permission.registry';
import { CasesService } from '../application/cases.service';
import { CaseListQueryDto } from '../dto/case-list-query.dto';
import { CaseMainInfoDto } from '../dto/case-main-info.dto';
import { CaseResponseDto } from '../dto/case-response.dto';
import { CreateCaseDto } from '../dto/create-case.dto';
import { UpdateCaseDto } from '../dto/update-case.dto';

@Controller('admin/cases')
export class CasesAdminController {
  constructor(private readonly casesService: CasesService) {}

  @Post()
  @Perm(PERMISSIONS.CASES_WRITE)
  create(@Body() dto: CreateCaseDto): Promise<CaseResponseDto> {
    return this.casesService.create(dto);
  }

  // Реиндексация всего контента — дороже обычных CRUD-операций, старый код держал её за
  // ADMIN_ROLES отдельно от общего CONTENT_ROLES контроллера (M4 code review).
  @Post('reindex')
  @Roles(...ADMIN_ROLES)
  @HttpCode(HttpStatus.OK)
  reindex(): Promise<void> {
    return this.casesService.reindexSearch();
  }

  @Get()
  @Perm(PERMISSIONS.CASES_READ)
  findList(
    @Query() query: CaseListQueryDto,
  ): Promise<PaginatedResult<CaseMainInfoDto>> {
    return this.casesService.findList(query);
  }

  @Get('all/main-info')
  @Perm(PERMISSIONS.CASES_READ)
  findAllMainInfo(
    @Query() query: CaseListQueryDto,
  ): Promise<PaginatedResult<CaseMainInfoDto>> {
    return this.casesService.findList(query);
  }

  @Get('slug/:slug')
  @Perm(PERMISSIONS.CASES_READ)
  findBySlug(@Param('slug') slug: string): Promise<CaseResponseDto> {
    return this.casesService.findBySlug(slug);
  }

  @Get(':id')
  @Perm(PERMISSIONS.CASES_READ)
  findById(@Param('id', ParseIntPipe) id: number): Promise<CaseResponseDto> {
    return this.casesService.findById(id);
  }

  @Patch(':id')
  @Perm(PERMISSIONS.CASES_WRITE)
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCaseDto,
  ): Promise<CaseResponseDto> {
    return this.casesService.update(id, dto);
  }

  @Delete(':id')
  @Perm(PERMISSIONS.CASES_DELETE)
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    await this.casesService.remove(id);
  }
}
