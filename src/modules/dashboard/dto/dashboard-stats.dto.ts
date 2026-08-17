import { PublicationStats } from '../../../core/persistence/count-publication-stats.util';

export class DashboardStatsDto {
  articles: PublicationStats;
  cases: PublicationStats;
  services: { total: number };
  clients: { total: number; totalLeads: number };
}
