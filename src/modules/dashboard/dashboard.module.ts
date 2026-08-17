import { Module } from '@nestjs/common';
import { ArticlesModule } from '../articles/articles.module';
import { CasesModule } from '../cases/cases.module';
import { ClientsModule } from '../clients/clients.module';
import { ServicesModule } from '../services/services.module';
import { DashboardController } from './api/dashboard.controller';
import { DashboardService } from './application/dashboard.service';

@Module({
  imports: [ArticlesModule, CasesModule, ServicesModule, ClientsModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
