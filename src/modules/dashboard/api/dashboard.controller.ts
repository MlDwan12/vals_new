import { Controller, Get } from '@nestjs/common';
import { Roles } from '../../../core/decorators/roles.decorator';
import { ALL_ROLES } from '../../../core/enums/role-groups.constant';
import { DashboardService } from '../application/dashboard.service';
import { DashboardStatsDto } from '../dto/dashboard-stats.dto';

@Controller('dashboard')
@Roles(...ALL_ROLES)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('stats')
  getStats(): Promise<DashboardStatsDto> {
    return this.dashboardService.getStats();
  }
}
