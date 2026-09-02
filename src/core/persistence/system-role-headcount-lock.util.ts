import { DataSource, EntityManager } from 'typeorm';
import { withAdvisoryXactLock } from './advisory-xact-lock.util';
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
  return withAdvisoryXactLock(dataSource, SYSTEM_ROLE_HEADCOUNT_LOCK_KEY, fn);
}
