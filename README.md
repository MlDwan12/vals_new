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

## Прод-деплой

`Dockerfile` (в `docker-compose.yml`) — dev-режим: `yarn start:dev`, root-пользователь, live-reload
через volume-mounted `src/`. Для реального деплоя — отдельный `Dockerfile.prod` (multi-stage,
non-root, `node dist/main`, встроенный `HEALTHCHECK` на `/health`):

```bash
docker build -f Dockerfile.prod -t vals_new:prod .
```

**`NODE_ENV=production` обязателен в артефактах деплоя** — от него зависят Swagger
(`ENABLE_SWAGGER` fail-open без него не имеет значения, дефолт для non-production — включён),
`Secure` на auth-куках и включённое SQL-логирование CLI (M1, round-2 review §5). `Dockerfile.prod`
задаёт его сам (`ENV NODE_ENV=production`), но если запуск идёт не через этот образ (другой
Dockerfile/оркестратор) — задать явно в его окружении, не полагаться на дефолт.

### Internal API bypass для SSR (`X-Internal-Key`)

Публичный сайт (Next.js SSR) ходит в API напрямую по docker-сети (`http://api:3000`), минуя nginx —
без этого весь его трафик попадает в общий с реальными посетителями IP-бакет глобального
rate limit'а (100/мин) и кладёт сайт под ботами поисковиков (R8, round-2 review).

- Секретный заголовок `X-Internal-Key` (значение — `INTERNAL_API_KEY` из `.env`, тот же ключ
  прописан у SSR без префикса `NEXT_PUBLIC_`) поднимает лимит **только для глобального троттлера**
  до `INTERNAL_API_RATE_LIMIT` (дефолт 3000/мин) — это предохранитель на случай зацикливания
  фронта/утечки ключа, не отключение лимита. `POST /bitrix` (5/мин) и `POST /auth/login` (10/мин)
  не затронуты — у них свой `@Throttle()` на уровне роута, в приоритете выше этого дефолта.
- `INTERNAL_API_KEY` не задан → bypass полностью выключен (не «пустой ключ совпал с пустым
  заголовком», проверено регресс-тестом — `core/rate-limit/internal-api-throttle.util.spec.ts`).
- На стороне nginx заголовок должен стираться на всех внешних запросах
  (`proxy_set_header X-Internal-Key "";` в обоих конфигах — фронта и админки) — подделать его
  снаружи нельзя. Порт API и так на `127.0.0.1` (`docker-compose.yml`), напрямую не достучаться.

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
Сначала — копирование физических файлов `uploads/image-lib/*` → `uploads/media/*` (жёсткая
предпосылка, без сети/транзакции: падает и останавливает перенос, если скопировалось не всё), затем
одна транзакция на саму БД с полным откатом при любой ошибке; id и последовательности сохраняются
как в источнике.

**Обязательный порядок:**

1. **Бэкап** целевой (`TARGET_*`) БД перед запуском — ETL не проверяет, что целевая БД пуста;
   если в ней уже что-то есть (в частности, если сид уже выполнялся раньше ETL — см. пункт 4),
   перенос упадёт на конфликте `users.id=1` и полностью откатится (транзакция), но лучше не
   полагаться на это как на план восстановления.
2. `yarn migration:run` — применить полную схему на **пустую** целевую БД.
3. `yarn migrate:prod-data` — сам перенос (см. переменные окружения ниже). Копирует физические
   файлы `uploads/image-lib/*` → `uploads/media/*` (см. `SOURCE_IMAGE_LIB_ROOT`) и переписывает
   ссылки `/uploads/image-lib/...` → `/uploads/media/...` в `content`/`content_html` статей и
   кейсов — на новом сервере отдельный каталог `uploads/image-lib/` **не нужен**, старый прод его
   не трогает (ТЗ §2: одна подсистема медиа, не два постоянно живых каталога). Скрипт сам проверяет
   после переноса, что ссылок на `image-lib` в контенте не осталось, и предупреждает, если остались.
4. `yarn seed:developer` — **только после** ETL, не до. Сид создаёт пользователя с `id=1`; если
   выполнить его раньше переноса, ETL, переносящий пользователей с исходными id, столкнётся с этим
   же `id=1` и откатится с ошибкой (безопасно, но сбивает порядок повторного прогона).

**Откат:** т.к. перенос данных — одна транзакция, при любой ошибке БД-части целевая БД остаётся в
состоянии до запуска ETL (пустая схема после `migration:run`) — откатывать вручную нечего, кроме
бэкапа из пункта 1, если ETL был запущен повторно поверх уже перенесённых данных. Копирование
файлов идёт **до** транзакции и идемпотентно (`copyFile` можно звать повторно) — если оно упало,
БД вообще не тронута, достаточно поправить `SOURCE_IMAGE_LIB_ROOT`/права и перезапустить `yarn
migrate:prod-data` целиком.

**Переменные окружения** (см. `.env.example`, раздел ETL) — `SOURCE_DB_*`/`TARGET_DB_*` для БД,
`SOURCE_IMAGE_LIB_ROOT` — путь к локально доступному `uploads/image-lib/` старого прода (обычно
заранее синхронизированная копия, не сам `SOURCE_DB_HOST`).

**Файлы старой таблицы `media` (не `image_lib`)** ETL не копирует — их имена/пути не меняются, они
уже лежат в `uploads/media/` старого прода под теми же именами, что и в БД-записи после переноса.
Перед первым запуском приложения на новых данных синхронизировать `uploads/media/` старого прода в
`uploads/media/` нового сервера (rsync/scp), не только `image-lib`.

## Линт и форматирование

```bash
yarn lint
yarn format
```
