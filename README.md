# vals_new

Бекенд VALS.DIGITAL, переписанный с нуля (NestJS 11 + TypeORM + PostgreSQL 16 + Meilisearch + pino).
Нормативное ТЗ и контекст переписывания — в репозитории `vals_api`
(`_docs/BACKEND_REWRITE_SPEC.md`, `_docs/REWRITE_FOUNDATION.md`).

Текущий статус: этапы 0–6 из §10 ТЗ реализованы (каркас, схема БД, авторизация, контент,
медиа, заявки/клиенты, поиск/аудит/дашборд). Осталось: этап 7 — миграция данных на копии
прода, нагрузочная проверка, деплой.

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

## Миграции

```bash
yarn migration:generate src/database/migrations/<Name>   # диффит по entity-классам
yarn migration:create src/database/migrations/<Name>     # пустой шаблон, без entity-диффа
yarn migration:run
yarn migration:revert
yarn migration:show
```

## Линт и форматирование

```bash
yarn lint
yarn format
```
