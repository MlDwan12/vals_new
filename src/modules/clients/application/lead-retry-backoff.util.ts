// Экспоненциальный backoff доставки в Bitrix (ТЗ §7 п.1): 1мин → 5мин → 30мин → 2ч → 6ч, дальше
// лид помечается FAILED и ждёт ручной отправки из админки — планировщик его больше не подбирает.
const RETRY_DELAYS_MS = [
  60_000,
  5 * 60_000,
  30 * 60_000,
  2 * 3_600_000,
  6 * 3_600_000,
];

export const MAX_DELIVERY_ATTEMPTS = RETRY_DELAYS_MS.length;

// retryCount — количество уже случившихся неудачных попыток (после инкремента на эту попытку).
// null означает «больше не пытаться автоматически».
export function computeNextRetryAt(retryCount: number): Date | null {
  const delay = RETRY_DELAYS_MS[retryCount - 1];
  return delay === undefined ? null : new Date(Date.now() + delay);
}

// 4xx (кроме 429 — это rate limit, транзиентная ошибка) от Bitrix означает постоянную проблему
// (отозванный вебхук, невалидный payload) — она не самоисправится через 6 попыток backoff'а,
// только сожжёт их впустую (M13 code review). Сетевые ошибки/таймауты/5xx — транзиентные, ретраятся
// как обычно.
export function isRetryableBitrixStatus(status: number | undefined): boolean {
  if (status === undefined) return true;
  if (status === 429) return true;
  return status < 400 || status >= 500;
}
