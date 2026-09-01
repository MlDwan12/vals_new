import { DataSource, EntityManager } from 'typeorm';
import { SYSTEM_ROLE_HEADCOUNT_LOCK_KEY } from './system-role-headcount-lock.constant';

// Общая обёртка для UsersRepository.runGuardedBySystemRoleHeadcount и
// RolesRepository.saveGuardedBySystemRoleHeadcount (security-audit-2026-08-31.md HIGH №2) — один
// и тот же advisory-лок сериализует оба пути между собой (правка пользователя || правка роли),
// раньше эта транзакция+лок дублировались построчно в обоих репозиториях (/simplify reuse+
// simplification finding).
export function withSystemRoleHeadcountLock<T>(
  dataSource: DataSource,
  fn: (manager: EntityManager) => Promise<T>,
): Promise<T> {
  return dataSource.transaction(async (manager) => {
    await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
      SYSTEM_ROLE_HEADCOUNT_LOCK_KEY,
    ]);
    return fn(manager);
  });
}
