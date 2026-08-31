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

  // Внутренние метки формы (EXPANSION_TASKS.md §6) — отдельными колонками, а не внутри payload:
  // по ним фильтрует админка, а фильтр по полю внутри jsonb неудобен. formId — закрытый набор из
  // FORM_IDS (по факту единицы значений), индекс даёт реальную селективность под точный фильтр в
  // админке; pagePath — свободный текст (URL), почти уникален построчно, индекс на нём не окупает
  // стоимость на каждой вставке (efficiency-обзор при закрытии задачи), поэтому без @Index(). blockId
  // (третье поле метки) в отдельную колонку не выносится — живёт в payload.source, у него нет
  // собственного фильтра в списке заявок.
  @Index()
  @Column({ name: 'form_id', type: 'varchar', length: 64, nullable: true })
  formId: string | null;

  @Column({ name: 'page_path', type: 'varchar', length: 500, nullable: true })
  pagePath: string | null;

  // Источник перехода (EXPANSION_TASKS.md §7) — дополнение к UTM-меткам, не замена: referrer
  // браузера дырявый (HTTPS→HTTP, Referrer-Policy, приложения/мессенджеры его не дают вовсе).
  @Column({ type: 'varchar', length: 2048, nullable: true })
  referrer: string | null;

  @Column({
    name: 'landing_path',
    type: 'varchar',
    length: 500,
    nullable: true,
  })
  landingPath: string | null;

  // Берётся на беке из заголовка запроса (req.headers['user-agent']), не с фронта — надёжнее и не
  // требует правки формы. В общий лог не попадает (redact.paths в app.module.ts, EXPANSION_TASKS.md
  // §7.1) — в БД лежит как обычное поле лида, в логах ему делать нечего.
  @Column({ name: 'user_agent', type: 'varchar', length: 512, nullable: true })
  userAgent: string | null;

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

  // Сколько раз зависший SENDING был реклеймлен по таймауту (не считает обычные Bitrix-ретраи —
  // те двигают retryCount). Верхняя граница на число повторных POST в Bitrix для одной заявки
  // (N-2, round-3 review) — см. ClientLeadsRepository.MAX_SENDING_RECLAIMS/failStuckDeliveries.
  @Column({ name: 'sending_reclaim_count', type: 'int', default: 0 })
  sendingReclaimCount: number;

  @Index()
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
