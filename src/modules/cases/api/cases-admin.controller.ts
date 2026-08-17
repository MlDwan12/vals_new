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
import { Roles } from '../../../core/decorators/roles.decorator';
import { CONTENT_ROLES } from '../../../core/enums/role-groups.constant';
import { PaginatedResult } from '../../../core/pagination/paginated-result.interface';
import { CasesService } from '../application/cases.service';
import { CaseListQueryDto } from '../dto/case-list-query.dto';
import { CaseMainInfoDto } from '../dto/case-main-info.dto';
import { CaseResponseDto } from '../dto/case-response.dto';
import { CreateCaseDto } from '../dto/create-case.dto';
import { UpdateCaseDto } from '../dto/update-case.dto';

@Controller('admin/cases')
@Roles(...CONTENT_ROLES)
export class CasesAdminController {
  constructor(private readonly casesService: CasesService) {}

  @Post()
  create(@Body() dto: CreateCaseDto): Promise<CaseResponseDto> {
    return this.casesService.create(dto);
  }

  @Post('reindex')
  @HttpCode(HttpStatus.OK)
  reindex(): Promise<void> {
    return this.casesService.reindexSearch();
  }

  @Get()
  findList(
    @Query() query: CaseListQueryDto,
  ): Promise<PaginatedResult<CaseMainInfoDto>> {
    return this.casesService.findList(query);
  }

  @Get('all/main-info')
  findAllMainInfo(
    @Query() query: CaseListQueryDto,
  ): Promise<PaginatedResult<CaseMainInfoDto>> {
    return this.casesService.findList(query);
  }

  @Get('slug/:slug')
  findBySlug(@Param('slug') slug: string): Promise<CaseResponseDto> {
    return this.casesService.findBySlug(slug);
  }

  @Get(':id')
  findById(@Param('id', ParseIntPipe) id: number): Promise<CaseResponseDto> {
    return this.casesService.findById(id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCaseDto,
  ): Promise<CaseResponseDto> {
    return this.casesService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    await this.casesService.remove(id);
  }
}
