import { Controller, Get, Query } from '@nestjs/common';
import { Perm } from '../../../core/decorators/perm.decorator';
import { PaginatedResult } from '../../../core/pagination/paginated-result.interface';
import { PERMISSIONS } from '../../../core/permissions/permission.registry';
import { AuditService } from '../application/audit.service';
import { AuditLogQueryDto } from '../dto/audit-log-query.dto';
import { AuditLogResponseDto } from '../dto/audit-log-response.dto';

@Controller('audit-logs')
@Perm(PERMISSIONS.AUDIT_READ)
export class AuditLogsAdminController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  findAll(
    @Query() query: AuditLogQueryDto,
  ): Promise<PaginatedResult<AuditLogResponseDto>> {
    return this.auditService.findAll(query);
  }
}
