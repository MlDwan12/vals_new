# Устранение замечаний внешнего ревью (REVIEW_backend_v2.md)

Отчёт по фиксам, внесённым в ответ на независимый внешний код-ревью проекта (`REVIEW_backend_v2.md`,
2026-08-19). Разобрано по важности: CRITICAL → HIGH → MEDIUM → LOW/INFO. После каждого крупного
батча — `/simplify` (4 параллельных агента: reuse/simplification/efficiency/altitude) +
`/code-review high`; оба раунда нашли реальные баги в собственных фиксах этой же сессии, они тоже
здесь. Каждый пункт после написания сверен построчно с текущим кодом (не по памяти) и с
`BACKEND_REWRITE_SPEC.md`.

`yarn build`/`yarn lint`/`yarn test` — зелёные (28 unit-тестов, было 14 до сессии).
`yarn test:e2e` не прогонялся — testcontainers не поднимается в песочнице инструмента, тот же
известный лимит окружения, что и в сессии 1 (см. `_docs/rewrite-log.md`).

---

## CRITICAL

**C1 — секретный `BITRIX_WEBHOOK` утекал в логи.**
`lead-delivery.service.ts` логировал `error` целиком; для `AxiosError` pino-сериализатор копирует
`config.url` (вебхук с секретным токеном Bitrix) и `config.data` (ПД лида). Теперь в лог идут
только безопасные поля: `message`/`code`/`response.status`.

## HIGH (все 10)

| # | Проблема | Фикс |
|---|---|---|
| H1 | `helmet()` без CORP блокировал бы кросс-origin загрузку `/uploads` | `crossOriginResourcePolicy: 'cross-origin'`, восстановлено 1:1 со старым бэком |
| H2 | Дефолтный лимит body-parser 100kb для TipTap-контента | `useBodyParser('json'/'urlencoded', {limit:'1mb'})` до `app.listen()` — порядок регистрации даёт нашему парсеру приоритет (проверено живым прогоном: 300KB — 201, 1.2MB — 413) |
| H3 | Не было `trust proxy` — rate limit/аудит по IP превращались в один бакет на всех за nginx | `app.set('trust proxy', 1)` |
| H4 | Файлы `image-lib` при ETL не переносились физически, только строки в БД | `migrate-prod-data.script.ts` копирует `uploads/image-lib/*` → `uploads/media/*` (bounded concurrency), новая env `SOURCE_IMAGE_LIB_ROOT` |
| H5 | 4 недокументированных изменения контракта (`stages`→`steps`, пропали `serviceIds/authorIds/tagIds` у кейса, `description` у embed-категории, `slug` тега стал обязательным) | Все восстановлены 1:1 со старым контрактом |
| H6 | Unpublish/публикация/смена slug синхронизировали в Meilisearch только сам документ, не его FAQ — черновик утекал в паблик-поиск через FAQ | `indexArticle`/`indexCase` теперь синхронизируют FAQ той же операцией |
| H7 | Отложенная публикация (`datePublished` в будущем) никогда сама не индексировалась | Периодические reindex-шедулеры (5 мин) для articles/cases/services |
| H8 | Гонка ротации refresh-токена — `revoke()` был безусловным UPDATE | Атомарный `UPDATE ... WHERE revoked_at IS NULL`; `affected === 0` → гасятся все сессии (тот же путь, что и явный реюз) |
| H9 | `resolveClientIp` брал первый элемент `X-Forwarded-For` вручную — спуфится клиентом | `request.ip` (надёжно благодаря H3/trust proxy) + truncate под `varchar(64)` |
| H10 | Доставка в Bitrix не атомарна — ручной retry и планировщик читали статус в память | Статус `SENDING` + атомарный claim `UPDATE ... WHERE status IN (pending, failed)`; реклейм зависшего `SENDING` по таймауту (2 мин) на случай крэша между claim и сохранением результата |

## MEDIUM (все, кроме трёх пунктов ниже)

M1 (Swagger fail-open → дефолт по `NODE_ENV`), M2 (`skipNullProperties: false` на всех Update-DTO —
см. также раздел ниже про повторно найденную дыру), M3 (тарифы сортируются по `orderIndex`), M4
(reindex — обратно за `ADMIN_ROLES` на 3 контроллерах), M7 (stale-документы в поиске чистятся;
services получил свой reindex-шедулер), M8 (README: порядок ETL + план отката; `.env.example`
дополнен), M9 (docker-compose: `DB_PORT` внутри сети всегда `5432`, порты БД/Meili — только
`127.0.0.1`), M12 (лог тела заявки при падении БД на приёме), M13 (4xx от Bitrix не ретраится как
транзиентная ошибка — отличается от 5xx/сети/429), M14 (ESLint: `no-explicit-any` → `warn`,
`no-floating-promises` → `error`, дословно по ТЗ §9).

**Решения пользователя:**
- **M5** — вернуть старую валидацию email (строгий формат только для `TARIFF_REQUEST`; для
  остальных типов заявок опечатка в email не блокирует лид).
- **M6** — оставить `CsrfOriginGuard` глобальным как есть, включая `/bitrix` (подтверждено ТЗ §6:
  "CSRF — глобально, а не выборочно на некоторых методах"); задокументировано в
  `db-and-functional-changes-vs-old-vals_api.md`.

**Осознанно не тронуто (паритет со старым кодом, было и там же):** M10 (timing side-channel на
логине), M11 (developer может деактивировать себя/последнего developer), M15 (удалённый тариф между
кликом и сабмитом → 400 до сохранения лида).

## LOW/INFO (основное)

JWT-алгоритм запинен (`HS256`), refresh-кука сужена до `path: '/auth'`, `x-request-id`
валидируется по формату/длине, ServeStatic — `maxAge: 1y`/`immutable`/без dotfiles, CLI
`data-source.ts` не логирует SQL в проде, лимит на длину имени файла и число полей формы при
загрузке медиа, `search` query-параметры получили `MaxLength`, Meilisearch self-heal
(`tryEnsureIndex()` перед каждым reindex-тиком), неиспользуемые `uuid`/`@types/uuid` убраны из
`package.json` (нужно `yarn install` для синхронизации `yarn.lock`).

**Осознанно не тронуто:** `forbidNonWhitelisted`/cache-buster параметры (ревью само просит
свериться с фронтом — недоступен в этой сессии, зафиксировано как открытый вопрос), структурное
дублирование `*-faq.service` между articles/cases/services (архитектурный рефакторинг вне рамок
сессии), `getRawMany<T>()` без рантайм-проверки в sitemap/tags, мигрированные не-webp записи в
media (информационный факт, не баг).

---

## Найдено `/simplify` + `/code-review high` (не из исходного ревью)

Два полных прохода: сначала по HIGH-батчу, затем по всему диффу разом. Ниже — то, что оказалось
реальными багами, а не стилистикой.

### Консолидация дублирования (после первого раунда)
- Новый статус `SENDING` (H10) протекал в публичный контракт `ClientLeadResponseDto.status` —
  замаплен обратно в `PENDING` в ответе, атомарность осталась целиком внутренней.
- Три reindex-шедулера + `LeadDeliveryScheduler` были 4 независимые копии одного `isRunning`/
  try-finally — вынесено в `core/scheduling/single-flight-guard.ts`.
- Три одинаковых метода `deleteStaleDocuments` в articles/cases/services — вынесено в
  `SearchIndexService.reconcileStaleDocuments()` + in-flight дедуп `getDocumentIds()` (три
  шедулера с одинаковым cron-тиком независимо сканировали общий для всех доменов
  `entityType='faq'` в Meilisearch — теперь дедуплицируется одним промисом).
- Два независимых Map-эвикшена (login-throttle, окно подавления ACCESS_DENIED) — вынесены в
  `core/collections/bounded-ttl-map.ts`.

### Реальные баги (найдены вторым раундом — по всему диффу)
- **`skipNullProperties: false` (M2) закрывал дыру не полностью.** Работает только для полей, у
  которых в `Create*Dto` не было `@IsOptional()`. Если было (поле опционально при создании, но
  NOT NULL с дефолтом в БД: `priority`/`hasToc`/`isPopular`/`orderIndex`/`isVisible`/`sameAs`/
  `backgroundColor`) — `@IsOptional()` наследуется в Update-DTO и **независимо** пропускает `null`
  мимо любых дополнительных условных валидаторов, PATCH всё равно падал 500-й. Задело
  `articles`/`cases`/`services`/`tags`/`employees`/`tariffs` — все такие поля переведены на
  `@ValidateIf((_, value) => value !== undefined)` (паттерн `industries.slug`, который и был
  эталоном для M2 изначально). Проверено эмпирически напрямую через `class-validator`
  (11 сценариев: null отклоняется на NOT NULL-полях, пропускается на реально nullable) +
  регресс-тест `update-tag.dto.spec.ts`.
- **`TagsService.create()` — идемпотентность по имени без backing constraint.** У `tags.name` в
  новой схеме не было unique-индекса (был в старом vals_api) — идемпотентность держалась только на
  check-then-act в приложении, конкурентный двойной сабмит с одним именем создавал два тега. Добавлена
  миграция `AddTagNameUnique` + `create()` при unique violation перечитывает по имени и отдаёт тег
  конкурента вместо 409.
- **`BoundedTtlMap` (только что написанный в этой же сессии) не гарантировал верхнюю границу.**
  Если атакующий шлёт уникальные ключи быстрее TTL-окна, протухших записей для чистки просто нет —
  `Map` росла бы неограниченно, да ещё с O(n) сканированием впустую на каждой вставке. Переписан на
  two-phase eviction: сначала протухшие записи, затем жёсткий FIFO по порядку вставки, если
  протухших не хватило. Регресс-тест — `bounded-ttl-map.spec.ts`.

---

## Не в этой сессии — ждёт пользователя

- `yarn test:e2e` — прогнать на своей машине.
- `yarn install` — синхронизировать `yarn.lock` после удаления `uuid`/`@types/uuid`.
- Сверить `forbidNonWhitelisted`/cache-buster параметры с `front`/`admin_front`.
- Новые миграции (`AddLeadDeliverySendingStatus`, `AddClientLeadSendingAt`, `AddTagNameUnique`) не
  применялись к реальной БД в этой сессии — только просмотрены `up()`/`down()`.
