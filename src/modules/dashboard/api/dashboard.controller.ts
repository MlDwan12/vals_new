import { Controller, Get } from '@nestjs/common';
import { DashboardService } from '../application/dashboard.service';
import { DashboardStatsDto } from '../dto/dashboard-stats.dto';

// Без @Roles()/@Perm(): стартовый экран панели открыт любому, кто вошёл. Легаси-@Roles(...ALL_ROLES)
// перечислял 4 сидированные роли и поэтому отдавал 403 держателю любой роли, заведённой из панели —
// то есть 403 на первом же экране после логина (FULLSTACK_PLAN.md, срез A.1). Своего кода права у
// дашборда нет и заводить его не за чем: отдельного права «видеть дашборд» в реестре не
// предусмотрено, а закрывать стартовый экран чужим кодом (articles.read и т.п.) значит снова
// сломать его части ролей. Гейт здесь — сам факт аутентификации (AuthGuard, глобальный).
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('stats')
  getStats(): Promise<DashboardStatsDto> {
    return this.dashboardService.getStats();
  }
}
