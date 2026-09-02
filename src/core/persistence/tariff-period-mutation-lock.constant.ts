// Единый фиксированный ключ advisory-лока (не по конкретному id) — сериализует между собой
// TariffPeriodsRepository.removeGuardedByTariffUsage (удаление периода) и
// TariffsRepository.saveGuardedByPeriodLock (создание/обновление тарифа с periodIds), иначе
// check-then-act по обе стороны (существует ли период / используется ли он) видит устаревшее
// состояние друг друга (security-audit-2026-08-31.md, MEDIUM №5). Один общий ключ, а не по
// periodId — операции редкие (админка), а разные periodId в одном запросе на тариф уже пришлось
// бы лочить по одному в фиксированном порядке ради защиты от deadlock; один ключ проще и
// достаточен.
export const TARIFF_PERIOD_MUTATION_LOCK_KEY = 'tariff-period-mutation';
