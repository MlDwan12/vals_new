# vals_new

Бекенд VALS.DIGITAL, переписанный с нуля (NestJS 11 + TypeORM + PostgreSQL 16 + Meilisearch + pino).
Нормативное ТЗ и контекст переписывания — в репозитории `vals_api`
(`_docs/BACKEND_REWRITE_SPEC.md`, `_docs/REWRITE_FOUNDATION.md`).

Текущий статус: этапы 0–7 из §10 ТЗ реализованы (каркас, схема БД, авторизация, контент,
медиа, заявки/клиенты, поиск/аудит/дашборд, ETL-перенос данных с прода). Осталось: нагрузочная
проверка, боевой деплой.

## Запуск локально

1. Установить зависимости:
   ```bash
   yarn install
   ```
2. Скопировать `.env.example` в `.env` и заполнить (пароль БД, `JWT_SECRET`/`JWT_REFRESH_SECRET`
   не короче 32 символов, `MEILI_MASTER_KEY` — свой, любая строка не короче 16 символов):
   ```bash
   cp .env.example .env
   ```
3. Поднять PostgreSQL и Meilisearch:
   ```bash
   docker compose up -d
   ```
4. Получить `MEILI_SEARCH_KEY` (ограниченный ключ только с правом `search` — публичный поиск не
   должен ходить мастер-ключом, ТЗ §6) и вписать в `.env`:
   ```bash
   curl -H "Authorization: Bearer $MEILI_MASTER_KEY" http://localhost:7700/keys
   # взять значение "Default Search API Key"
   ```
5. Накатить миграции:
   ```bash
   yarn migration:run
   ```
6. Создать первого пользователя (роль `developer`, читает `SEED_DEVELOPER_USERNAME`/
   `SEED_DEVELOPER_PASSWORD` из `.env`):
   ```bash
   yarn seed:developer
   ```
7. Запустить приложение:
   ```bash
   yarn start:dev
   ```
8. Проверить:
   - `GET http://localhost:3000/health` — живость приложения + подключение к БД.
   - `http://localhost:3000/docs` — Swagger (только если `ENABLE_SWAGGER=true`, в проде выключать).

## Домены

`articles`, `cases`, `services` (+категории/шаги/тарифы), `tags`, `industries`, `employees`,
`media`, `clients` (+заявки, доставка в Bitrix24), `users`/`auth`, `search` (Meilisearch),
`audit` (аудит-лог + retention), `dashboard` — по одному модулю на домен, единый шаблон
`api/application/infrastructure/domain/dto` (см. `CLAUDE.md` §3, эталон — `src/modules/health`).

## Тесты

```bash
yarn test        # unit
yarn test:e2e    # e2e — поднимает реальный Postgres через testcontainers, не моки
```

`testcontainers` требует Node >= 22.22 (`package.json` заявляет `>=22`, но `yarn install` на более
ранних 22.x падает без `--ignore-engines`) — при установке на CI/новой машине проверить версию
Node отдельно.

## Миграции

```bash
yarn migration:generate src/database/migrations/<Name>   # диффит по entity-классам
yarn migration:create src/database/migrations/<Name>     # пустой шаблон, без entity-диффа
yarn migration:run
yarn migration:revert
yarn migration:show
```

## Миграция данных с прода (ETL)

Одноразовый инструмент (`yarn migrate:prod-data`, `src/database/data-migration/`), не часть
рантайма приложения — переносит данные из копии боевой БД старого `vals_api` в эту (новую) БД.
Одна транзакция, полный откат при любой ошибке; id и последовательности сохраняются как в
источнике.

**Обязательный порядок:**

1. **Бэкап** целевой (`TARGET_*`) БД перед запуском — ETL не проверяет, что целевая БД пуста;
   если в ней уже что-то есть (в частности, если сид уже выполнялся раньше ETL — см. пункт 4),
   перенос упадёт на конфликте `users.id=1` и полностью откатится (транзакция), но лучше не
   полагаться на это как на план восстановления.
2. `yarn migration:run` — применить полную схему на **пустую** целевую БД.
3. `yarn migrate:prod-data` — сам перенос (см. переменные окружения ниже). Дополнительно копирует
   физические файлы `uploads/image-lib/*` → `uploads/media/*` (см. `SOURCE_IMAGE_LIB_ROOT`).
4. `yarn seed:developer` — **только после** ETL, не до. Сид создаёт пользователя с `id=1`; если
   выполнить его раньше переноса, ETL, переносящий пользователей с исходными id, столкнётся с этим
   же `id=1` и откатится с ошибкой (безопасно, но сбивает порядок повторного прогона).

**Откат:** т.к. перенос — одна транзакция, при любой ошибке целевая БД остаётся в состоянии до
запуска ETL (пустая схема после `migration:run`) — откатывать вручную нечего, кроме бэкапа из
пункта 1, если ETL был запущен повторно поверх уже перенесённых данных.

**Переменные окружения** (см. `.env.example`, раздел ETL) — `SOURCE_DB_*`/`TARGET_DB_*` для БД,
`SOURCE_IMAGE_LIB_ROOT` — путь к локально доступному `uploads/image-lib/` старого прода (обычно
заранее синхронизированная копия, не сам `SOURCE_DB_HOST`).

## Линт и форматирование

```bash
yarn lint
yarn format
```
