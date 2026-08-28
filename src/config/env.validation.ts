import { z } from 'zod';

const booleanFromString = (defaultValue: boolean) =>
  z
    .string()
    .optional()
    .transform((value) =>
      value === undefined
        ? defaultValue
        : value.trim().toLowerCase() === 'true',
    );

export const envSchema = z
  .object({
    NODE_ENV: z
      .enum(['development', 'test', 'production'])
      .default('development'),
    APP_PORT: z.coerce.number().int().positive().default(3000),

    DB_HOST: z.string().min(1),
    DB_PORT: z.coerce.number().int().positive(),
    DB_USER: z.string().min(1),
    DB_PASS: z.string().min(1),
    DB_NAME: z.string().min(1),

    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace'])
      .default('info'),
    LOG_PRETTY: booleanFromString(false),

    CORS_ORIGINS: z
      .string()
      .min(
        1,
        'CORS_ORIGINS обязателен — список разрешённых origin через запятую',
      ),

    // Дефолт зависит от NODE_ENV (не голое true) — забытая переменная в проде не должна открывать
    // /docs (M1 code review). Явно заданное значение всегда выигрывает.
    ENABLE_SWAGGER: z.string().optional(),

    JWT_SECRET: z
      .string()
      .min(32, 'JWT_SECRET должен быть не короче 32 символов'),
    JWT_REFRESH_SECRET: z
      .string()
      .min(32, 'JWT_REFRESH_SECRET должен быть не короче 32 символов'),

    // Не через .min(1)/.url() как обязательное — иначе миграции/тесты/dev-сервер падают на старте
    // ещё до того, как реально понадобится доставка в Bitrix. Проверка — в рантайме, в BitrixClient,
    // тем же способом, что в старом bitrix.service.ts ("Webhook Bitrix не настроен").
    BITRIX_WEBHOOK: z
      .string()
      .optional()
      .transform((value) =>
        value && value.trim().length > 0 ? value : undefined,
      ),

    // Секретный заголовок X-Internal-Key для internal-трафика (SSR публичного сайта, ходит в API
    // напрямую по docker-сети, минуя nginx и его rate-limit) — освобождает от глобального
    // троттлера, но не убирает потолок целиком (см. INTERNAL_API_RATE_LIMIT), только поднимает
    // его. Не задан — bypass выключен полностью, не "пустой ключ совпал с пустым заголовком" (R8,
    // round-2 review). nginx на стороне инфры стирает этот заголовок на всех внешних запросах —
    // подделать снаружи нельзя.
    INTERNAL_API_KEY: z
      .string()
      .optional()
      .refine(
        (value) =>
          !value || value.trim().length === 0 || value.trim().length >= 16,
        'INTERNAL_API_KEY должен быть не короче 16 символов (как MEILI_MASTER_KEY) — слабый ключ' +
          ' проще подобрать/угадать тому, кто уже добрался до заголовка (/code-review high)',
      )
      // .trim() и здесь — не просто симметрия с .refine(): значение сравнивается через
      // timingSafeEqual с заголовком (`INTERNAL_API_KEY.guard.ts`), а Node обрезает пробелы по
      // краям HTTP-заголовка по RFC. Нетримленное значение в env никогда бы не совпало с реально
      // пришедшим заголовком — bypass молча не работал бы при внешне валидном (>=16 символов
      // после trim в .refine выше) ключе с пробелом (round-3 review).
      .transform((value) =>
        value && value.trim().length > 0 ? value.trim() : undefined,
      ),
    // Предохранитель, не "нет лимита": если фронт зациклится или ключ утечёт, бэк не должен
    // молотить БД без ограничения. Реальный SSR-поток штатно далеко ниже (nginx кеширует
    // SSR-страницы), высокое число — только страховка.
    INTERNAL_API_RATE_LIMIT: z.coerce.number().int().positive().default(3000),

    MEILI_HOST: z.string().min(1),
    // Мастер-ключ — только для админских операций (индексация/reindex), приложение выпускает его
    // сам при разворачивании Meilisearch (не сторонний секрет вроде BITRIX_WEBHOOK), обязателен.
    MEILI_MASTER_KEY: z
      .string()
      .min(16, 'MEILI_MASTER_KEY должен быть не короче 16 символов'),
    // Ограниченный ключ (только права search) — публичный GET /search ходит им, не мастер-ключом
    // (ТЗ §6). Значение выдаёт сам Meilisearch после старта (GET /keys), не задаётся заранее.
    MEILI_SEARCH_KEY: z.string().min(1),

    // Срок хранения audit_logs, дней (EXPANSION_TASKS.md §2.5) — конфиг, не секрет, дефолт
    // безопасно задать здесь же (было константой в планировщике).
    AUDIT_RETENTION_DAYS: z.coerce.number().int().positive().default(180),
  })
  .transform((data) => ({
    ...data,
    ENABLE_SWAGGER:
      data.ENABLE_SWAGGER === undefined
        ? data.NODE_ENV !== 'production'
        : data.ENABLE_SWAGGER.trim().toLowerCase() === 'true',
  }));

export type EnvConfig = z.infer<typeof envSchema>;

export function validate(config: Record<string, unknown>): EnvConfig {
  const result = envSchema.safeParse(config);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Некорректная конфигурация окружения:\n${issues}`);
  }
  return result.data;
}
