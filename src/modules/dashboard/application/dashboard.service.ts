import { Injectable } from '@nestjs/common';
import { ArticlesRepository } from '../../articles/infrastructure/articles.repository';
import { CasesRepository } from '../../cases/infrastructure/cases.repository';
import { ClientLeadsRepository } from '../../clients/infrastructure/client-leads.repository';
import { ClientsRepository } from '../../clients/infrastructure/clients.repository';
import { ServicesRepository } from '../../services/infrastructure/services.repository';
import { DashboardStatsDto } from '../dto/dashboard-stats.dto';

// Дашборд не владеет своей таблицей — нет infrastructure/repository, только агрегация чужих
// репозиториев на уровне application (тот же приём, что TariffSnapshotResolverService в clients
// напрямую инжектирует TariffsRepository/TariffPeriodsRepository — этап 5).
@Injectable()
export class DashboardService {
  constructor(
    private readonly articlesRepository: ArticlesRepository,
    private readonly casesRepository: CasesRepository,
    private readonly servicesRepository: ServicesRepository,
    private readonly clientsRepository: ClientsRepository,
    private readonly clientLeadsRepository: ClientLeadsRepository,
  ) {}

  async getStats(): Promise<DashboardStatsDto> {
    const [articles, cases, servicesTotal, clientsTotal, leadsTotal] =
      await Promise.all([
        this.articlesRepository.countStats(),
        this.casesRepository.countStats(),
        this.servicesRepository.count(),
        this.clientsRepository.count(),
        this.clientLeadsRepository.count(),
      ]);

    return {
      articles,
      cases,
      services: { total: servicesTotal },
      clients: { total: clientsTotal, totalLeads: leadsTotal },
    };
  }
}
