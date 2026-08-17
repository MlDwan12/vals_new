import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TariffPeriodsModule } from '../tariff-periods/tariff-periods.module';
import { TariffsModule } from '../tariffs/tariffs.module';
import { ClientContactsAdminController } from './api/client-contacts-admin.controller';
import { ClientLeadsAdminController } from './api/client-leads-admin.controller';
import { ClientsAdminController } from './api/clients-admin.controller';
import { LeadsController } from './api/leads.controller';
import { BitrixClient } from './application/bitrix-client';
import { ClientContactsAdminService } from './application/client-contacts-admin.service';
import { ClientLeadsAdminService } from './application/client-leads-admin.service';
import { ClientsAdminService } from './application/clients-admin.service';
import { LeadDeliveryScheduler } from './application/lead-delivery.scheduler';
import { LeadDeliveryService } from './application/lead-delivery.service';
import { LeadsService } from './application/leads.service';
import { TariffSnapshotResolverService } from './application/tariff-snapshot-resolver.service';
import { Client } from './domain/client.entity';
import { ClientContact } from './domain/client-contact.entity';
import { ClientLead } from './domain/client-lead.entity';
import { ClientContactsRepository } from './infrastructure/client-contacts.repository';
import { ClientLeadsRepository } from './infrastructure/client-leads.repository';
import { ClientsRepository } from './infrastructure/clients.repository';

@Module({
  imports: [
    TypeOrmModule.forFeature([Client, ClientContact, ClientLead]),
    TariffsModule,
    TariffPeriodsModule,
  ],
  controllers: [
    LeadsController,
    ClientsAdminController,
    ClientContactsAdminController,
    ClientLeadsAdminController,
  ],
  providers: [
    ClientsRepository,
    ClientContactsRepository,
    ClientLeadsRepository,
    ClientsAdminService,
    ClientContactsAdminService,
    ClientLeadsAdminService,
    LeadsService,
    TariffSnapshotResolverService,
    BitrixClient,
    LeadDeliveryService,
    LeadDeliveryScheduler,
  ],
  exports: [ClientsRepository, ClientLeadsRepository],
})
export class ClientsModule {}
