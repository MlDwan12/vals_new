# vals_new

Бекенд VALS.DIGITAL, переписанный с нуля (NestJS 11 + TypeORM + PostgreSQL 16 + Meilisearch + pino).
Нормативное ТЗ и контекст переписывания — в репозитории `vals_api`
(`_docs/BACKEND_REWRITE_SPEC.md`, `_docs/REWRITE_FOUNDATION.md`).

Текущий статус: этап 0 (каркас) — конфиг, логгер, глобальные pipe/guard/interceptor/filter,
единый формат ответа/ошибки, эталонный модуль (`GET /health`). Реальных доменных сущностей и
миграций схемы БД пока нет — это этап 1.

## Запуск локально

1. Установить зависимости:
   ```bash
   yarn install
   ```
2. Скопировать `.env.example` в `.env` и заполнить (пароль БД — свой):
   ```bash
   cp .env.example .env
   ```
3. Поднять PostgreSQL:
   ```bash
   docker compose up -d
   ```
4. Запустить приложение:
   ```bash
   yarn start:dev
   ```
5. Проверить:
   - `GET http://localhost:3000/health` — живость приложения + подключение к БД.
   - `http://localhost:3000/docs` — Swagger (только если `ENABLE_SWAGGER=true`).

Когда появится схема БД (этап 1), процедура дополнится шагом `yarn migration:run` перед запуском.

## Тесты

```bash
yarn test        # unit
yarn test:e2e    # e2e — поднимает реальный Postgres через testcontainers, не моки
```

## Линт и форматирование

```bash
yarn lint
yarn format
```
