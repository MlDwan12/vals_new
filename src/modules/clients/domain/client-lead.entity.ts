import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ClientLeadType } from '../enums/client-lead-type.enum';
import { LeadDeliveryStatus } from '../enums/lead-delivery-status.enum';
import { Client } from './client.entity';

@Entity('client_leads')
export class ClientLead {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @Column({ name: 'client_id', type: 'int' })
  clientId: number;

  @ManyToOne(() => Client, (client) => client.leads, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'client_id' })
  client: Client;

  @Column({
    name: 'external_system',
    type: 'varchar',
    length: 50,
    default: 'BITRIX',
  })
  externalSystem: string;

  @Index()
  @Column({ type: 'enum', enum: ClientLeadType })
  type: ClientLeadType;

  @Column({ type: 'varchar', length: 255, nullable: true })
  name: string | null;

  @Column({ name: 'phone_raw', type: 'varchar', length: 64, nullable: true })
  phoneRaw: string | null;

  @Index()
  @Column({
    name: 'phone_normalized',
    type: 'varchar',
    length: 32,
    nullable: true,
  })
  phoneNormalized: string | null;

  @Column({ name: 'email_raw', type: 'varchar', length: 255, nullable: true })
  emailRaw: string | null;

  @Index()
  @Column({
    name: 'email_normalized',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  emailNormalized: string | null;

  @Column({ type: 'text', nullable: true })
  message: string | null;

  @Column({ type: 'text', nullable: true })
  comment: string | null;

  @Column({ type: 'jsonb', nullable: true })
  utm: Record<string, string> | null;

  @Column({ type: 'jsonb' })
  payload: Record<string, unknown>;

  @Column({ name: 'bitrix_payload', type: 'jsonb', nullable: true })
  bitrixPayload: Record<string, unknown> | null;

  @Column({
    name: 'bitrix_lead_id',
    type: 'varchar',
    length: 64,
    nullable: true,
  })
  bitrixLeadId: string | null;

  @Column({ name: 'bitrix_response', type: 'jsonb', nullable: true })
  bitrixResponse: Record<string, unknown> | null;

  // Доставка в Bitrix — асинхронная, планировщиком (ТЗ §7 п.1). status/retryCount/nextRetryAt
  // описывают состояние доставки, не самой заявки — заявка уже сохранена к моменту, когда эти поля
  // начинают меняться.
  @Index()
  @Column({
    type: 'enum',
    enum: LeadDeliveryStatus,
    default: LeadDeliveryStatus.PENDING,
  })
  status: LeadDeliveryStatus;

  @Column({ name: 'retry_count', type: 'int', default: 0 })
  retryCount: number;

  @Index()
  @Column({ name: 'next_retry_at', type: 'timestamptz', nullable: true })
  nextRetryAt: Date | null;

  @Column({ name: 'bitrix_error', type: 'text', nullable: true })
  bitrixError: string | null;

  // Момент claim-а (PENDING/FAILED -> SENDING). Без него зависший процесс (крэш/kill между claim
  // и markSent/markFailedAttempt) навсегда застревает в SENDING — findDueForDelivery отбирает
  // только PENDING, реклейм по устаревшему sendingAt возвращает такую заявку в оборот (altitude
  // review на H10-фикс).
  @Column({ name: 'sending_at', type: 'timestamptz', nullable: true })
  sendingAt: Date | null;

  @Index()
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
