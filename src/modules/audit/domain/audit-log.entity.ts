import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

// Композитный (user_id, created_at) вместо отдельного индекса на user_id (EXPANSION_TASKS.md
// §2.5) — самый частый запрос экрана журнала: "записи этого сотрудника, по времени". Составной
// индекс покрывает и фильтр по одному user_id (leftmost prefix), отдельный убран как избыточный.
@Index(['userId', 'createdAt'])
@Entity('audit_logs')
export class AuditLog {
  @PrimaryGeneratedColumn()
  id: number;

  // Без FK на users намеренно — запись должна пережить удаление пользователя.
  @Column({ name: 'user_id', type: 'int', nullable: true })
  userId: number | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  username: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  role: string | null;

  // Свободная строка, а не enum на уровне БД — см. AuditAction для допустимых значений в коде.
  @Index()
  @Column({ type: 'varchar', length: 64 })
  action: string;

  @Column({ type: 'varchar', length: 16 })
  method: string;

  @Column({ type: 'varchar', length: 512 })
  path: string;

  @Index()
  @Column({ type: 'varchar', length: 128, nullable: true })
  resource: string | null;

  @Column({ name: 'resource_id', type: 'int', nullable: true })
  resourceId: number | null;

  @Index()
  @Column({ name: 'status_code', type: 'int' })
  statusCode: number;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  ip: string | null;

  // Санитайзированное тело запроса (EXPANSION_TASKS.md §2.2) — что именно изменили, не только
  // факт правки. null для записей об ошибках (HttpExceptionFilter не строит meta — там нет "что
  // изменилось", только код и текст отказа) и для подписанных (signed=true) мутаций без тела
  // (DELETE); для неподписанных запись всегда содержит хотя бы пустой объект.
  @Column({ type: 'jsonb', nullable: true })
  meta: Record<string, unknown> | null;

  // true — resource/action заданы декоратором @Audit (EXPANSION_TASKS.md §2.3), false —
  // автоправило по пути/методу (AuditInterceptor.resolveAction/resolveAuditResource). Отдельная
  // колонка, а не флаг внутри meta — это факт про саму запись, а не часть тела запроса, и должен
  // быть фильтруемым/индексируемым, а не спрятан в jsonb.
  @Column({ type: 'boolean', default: false })
  signed: boolean;

  @Index()
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
