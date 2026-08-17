import { Controller, Get, Query } from '@nestjs/common';
import { Roles } from '../../../core/decorators/roles.decorator';
import { ADMIN_ROLES } from '../../../core/enums/role-groups.constant';
import { PaginatedResult } from '../../../core/pagination/paginated-result.interface';
import { AuditService } from '../application/audit.service';
import { AuditLogQueryDto } from '../dto/audit-log-query.dto';
import { AuditLogResponseDto } from '../dto/audit-log-response.dto';

@Controller('audit-logs')
@Roles(...ADMIN_ROLES)
export class AuditLogsAdminController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  findAll(
    @Query() query: AuditLogQueryDto,
  ): Promise<PaginatedResult<AuditLogResponseDto>> {
    return this.auditService.findAll(query);
  }
}
