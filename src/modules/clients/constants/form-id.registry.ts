// Стартовый набор — по существующим ClientLeadType (каждому типу заявки соответствует своя форма
// на сайте) плюс exit-intent (EXPANSION_TASKS.md §8, единственный формат явно назван в документе).
// Полный список форм задаёт фронт (репозиторий недоступен в этой сессии) — намеренно не блокирует
// задачу 6: неизвестный formId не отклоняет заявку (см. isKnownFormId в leads.service.ts), только
// теряет метку и пишет WARN, так что набор безопасно расширять по мере появления реальных форм.
export const FORM_IDS = {
  FREE_CONSULTATION: 'free-consultation',
  FREE_AUDIT: 'free-audit',
  TARIFF_REQUEST: 'tariff-request',
  ADD_QUESTION: 'add-question',
  PARTNER: 'partner',
  EXIT_INTENT: 'exit-intent',
} as const;

export type FormId = (typeof FORM_IDS)[keyof typeof FORM_IDS];

const KNOWN_FORM_IDS = new Set<string>(Object.values(FORM_IDS));

export function isKnownFormId(value: string): value is FormId {
  return KNOWN_FORM_IDS.has(value);
}
