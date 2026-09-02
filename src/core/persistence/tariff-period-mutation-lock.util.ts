import { DataSource } from 'typeorm';
import { withAdvisoryXactLock } from './advisory-xact-lock.util';
import { TARIFF_PERIOD_MUTATION_LOCK_KEY } from './tariff-period-mutation-lock.constant';

// По образцу withSystemRoleHeadcountLock (security-audit-2026-08-31.md HIGH №2, сессия 29) —
// сериализует удаление периода и создание/обновление тарифа, ссылающегося на periodIds, между
// собой. Колбэку не передаётся EntityManager транзакции (в отличие от withAdvisoryXactLock) —
// оба вызывающих места (TariffPeriodsService.remove, TariffsService.create/update) продолжают
// ходить через уже инжектированные им обычные репозитории, лок сам по себе достаточен для
// сериализации (/simplify simplification+altitude finding — неиспользуемый параметр).
export function withTariffPeriodMutationLock<T>(
  dataSource: DataSource,
  fn: () => Promise<T>,
): Promise<T> {
  return withAdvisoryXactLock(dataSource, TARIFF_PERIOD_MUTATION_LOCK_KEY, fn);
}
