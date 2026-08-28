import { SetMetadata } from '@nestjs/common';

export const AUDIT_KEY = 'audit';

export interface AuditMetadata {
  action: string;
}

// Переопределяет автоматически выведенный из пути/метода action в audit_logs — для ручек, где
// автоправило даёт неинформативную запись (EXPANSION_TASKS.md §2.3): например,
// PATCH /admin/users/:id/password автоправило назвало бы просто "обновление users", хотя это
// операция другого уровня доверия (сброс чужого пароля). resource декоратор не переопределяет —
// ни одна ручка в проекте пока в этом не нуждается (уже верно выводится из пути), а поле "на
// будущее" без реального вызывающего — абстракция про запас (CLAUDE.md §5, code review high).
// Забытый декоратор не отменяет запись — AuditInterceptor всё равно пишет её с автоправилом,
// только помечает audit_logs.signed = false.
export const Audit = (metadata: AuditMetadata) =>
  SetMetadata(AUDIT_KEY, metadata);
