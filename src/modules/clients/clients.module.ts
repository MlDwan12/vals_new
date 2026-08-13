import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Client } from './domain/client.entity';
import { ClientContact } from './domain/client-contact.entity';
import { ClientLead } from './domain/client-lead.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Client, ClientContact, ClientLead])],
})
export class ClientsModule {}
