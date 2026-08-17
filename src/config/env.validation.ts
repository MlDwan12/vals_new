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

export const envSchema = z.object({
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

  ENABLE_SWAGGER: booleanFromString(true),

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

  MEILI_HOST: z.string().min(1),
  // Мастер-ключ — только для админских операций (индексация/reindex), приложение выпускает его
  // сам при разворачивании Meilisearch (не сторонний секрет вроде BITRIX_WEBHOOK), обязателен.
  MEILI_MASTER_KEY: z
    .string()
    .min(16, 'MEILI_MASTER_KEY должен быть не короче 16 символов'),
  // Ограниченный ключ (только права search) — публичный GET /search ходит им, не мастер-ключом
  // (ТЗ §6). Значение выдаёт сам Meilisearch после старта (GET /keys), не задаётся заранее.
  MEILI_SEARCH_KEY: z.string().min(1),
});

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
