import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ClientContact } from './client-contact.entity';
import { ClientLead } from './client-lead.entity';

@Entity('clients')
export class Client {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 255, nullable: true })
  name: string | null;

  // Индексы на этих двух полях — горячий путь дедупликации при каждом новом лиде.
  @Index()
  @Column({
    name: 'primary_phone',
    type: 'varchar',
    length: 32,
    nullable: true,
  })
  primaryPhone: string | null;

  @Index()
  @Column({
    name: 'primary_email',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  primaryEmail: string | null;

  @Column({ name: 'leads_count', type: 'int', default: 0 })
  leadsCount: number;

  @Column({ name: 'last_lead_at', type: 'timestamptz', nullable: true })
  lastLeadAt: Date | null;

  @Column({ name: 'is_merged', type: 'boolean', default: false })
  isMerged: boolean;

  @Column({ name: 'merged_into_client_id', type: 'int', nullable: true })
  mergedIntoClientId: number | null;

  @ManyToOne(() => Client, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'merged_into_client_id' })
  mergedIntoClient: Client | null;

  @OneToMany(() => ClientContact, (contact) => contact.client)
  contacts: ClientContact[];

  @OneToMany(() => ClientLead, (lead) => lead.client)
  leads: ClientLead[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
