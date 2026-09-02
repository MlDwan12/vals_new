import { DataSource, EntityManager } from 'typeorm';

// Общий примитив для именованных advisory-локов на время транзакции (было по одной копии этой
// же функции под system-role-headcount-lock и tariff-period-mutation-lock — /simplify reuse
// finding). pg_advisory_xact_lock снимается сам на commit/rollback транзакции.
//
// Двухаргументная форма с фиксированным namespace — не одноаргументный hashtext(lockKey) — по
// той же схеме, что PHONE_LOCK_NAMESPACE/EMAIL_LOCK_NAMESPACE в ClientLeadsRepository: исключает
// коллизию с локами вне этого примитива (187_001/187_002 там, 187_100 здесь). Коллизию hashtext()
// МЕЖДУ двумя разными именованными локами на этом самом примитиве (например, headcount vs
// tariff-period) двухаргументная форма не устраняет — при 32-битном hashtext на 2-3 реально
// существующих ключа вероятность пренебрежимо мала; полное устранение потребовало бы отдельного
// реестра вручную назначенных целых id вместо строковых ключей, что менее читаемо (code review
// high — компромисс сознательный, не недосмотр).
const NAMED_LOCK_NAMESPACE = 187_100;

export function withAdvisoryXactLock<T>(
  dataSource: DataSource,
  lockKey: string,
  fn: (manager: EntityManager) => Promise<T>,
): Promise<T> {
  return dataSource.transaction(async (manager) => {
    await manager.query('SELECT pg_advisory_xact_lock($1, hashtext($2))', [
      NAMED_LOCK_NAMESPACE,
      lockKey,
    ]);
    return fn(manager);
  });
}
