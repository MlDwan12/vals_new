# План выкатки: переключение прода на `backend_v2`

Собран 2026-09-12 сверкой `SWITCH_CHECKLIST.md`, `INFRA_INTERNAL_KEY.md`, `FRONTEND_MIGRATION_PLAN.md`
(части 3.2 и 4), `backend_v2/README.md` (ETL) и `FULLSTACK_PLAN.md` с фактическим состоянием
репозиториев и боевого `.env`.

**Что выкатываем:** этап 1 (переключение на `backend_v2`) вместе со срезами A, B, C, D, G, H, X и E
разом — они делались в ветках и на прод ещё не уезжали.

**Решения по инфраструктуре (2026-09-12):**

- целевая БД — **новая база в том же контейнере postgres**, старая остаётся нетронутой и служит
  планом отката;
- образы собираются **локально**, архивируются, заливаются WinSCP и разворачиваются на сервере;
  БД заменяется до разворачивания образов;
- **короткое окно простоя допустимо** — выбирать ночь или выходной, когда не идут заявки.

**Правило порядка, нарушать нельзя:** бек поднимается **не позже** фронтов. После среза X админка
не присылает `contentHtml`, и со старым беком материал сохранился бы с пустым HTML, а сайт рендерить
из JSON не умеет.

---

## Фаза 0. Заранее, без простоя

### 0.1. Запушить ветки

Сейчас не запушено: `front/feature/fsd` — 17 коммитов, `admin_front/feature/editor-ui-polish` — 24,
`backend_v2/dev` вообще без upstream (32 коммита впереди `origin/master`). Пока это так, вся работа
живёт только на одной машине.

```bash
git -C front push origin feature/fsd
git -C admin_front push origin feature/editor-ui-polish
git -C backend_v2 push -u origin dev
```

Слияние в `main`/`master` — отдельное решение (записано в бэклоге как «разобрать перед выкаткой»).
Для самой выкатки оно не обязательно: образы собираются из рабочих копий.

### 0.2. Сгенерировать внутренний ключ

```bash
openssl rand -hex 32
```

Одна и та же строка пойдёт в `.env` бека и в `environment` фронта. Требование бека — не короче 16
символов после `trim`.

### 0.3. Собрать образы локально

Теги — по дате выкатки, как принято в боевом `docker-compose.yml`.

```bash
docker build -t vals_backend:12.09.2026 ./backend_v2
```

```bash
docker build -t vals.digital:12.09.2026 --build-arg NEXT_PUBLIC_MODE=production --build-arg NEXT_PUBLIC_BASE_URL=https://vals.digital --build-arg NEXT_PUBLIC_HOST=vals.digital --build-arg NEXT_PUBLIC_METRIKA_ID=<id> ./front
```

```bash
docker build -t admin_vals:12.09.2026 --build-arg NEXT_PUBLIC_API_URL=https://vals.digital/api --build-arg NEXT_PUBLIC_MEDIA_ORIGIN=https://vals.digital ./admin_front
```

**Внимание на админку:** build-arg переименован (`NEXT_PUBLIC_MEDIA_URL` → `NEXT_PUBLIC_MEDIA_ORIGIN`)
и сменил смысл — теперь это **origin без пути**. Оставить старое значение под новым именем опаснее,
чем забыть вовсе: путь склеится дважды (`…/uploads/media//uploads/media/x.webp`) и вся медиатека
отвалится разом (`SWITCH_CHECKLIST.md` §6).

**Внимание на бек:** `backend_v2/Dockerfile` — dev-образ (`yarn start:dev`, полный `node_modules`).
Для выкатки это даже удобно — в контейнере есть `ts-node` и исходники, а значит скрипты переноса
(шаги 1.9 и 1.10) запускаются прямо в нём. Но для прода это временное решение: в бэклог стоит
записать сборку prod-образа (`yarn build` + `start:prod` + только прод-зависимости).

### 0.4. Выгрузить и залить образы

```bash
docker save vals_backend:12.09.2026 vals.digital:12.09.2026 admin_vals:12.09.2026 | gzip > vals-images-12.09.2026.tar.gz
```

Залить WinSCP на сервер вместе с каталогом `front/src/views/service/config/services` (640 КБ) — он
нужен на шаге 1.10 для переноса меты услуг.

### 0.5. Подготовить правки nginx (не применять)

Два конфига — основной и `www`:

1. внутри `location /api/` добавить `proxy_set_header X-Internal-Key "";` — иначе поднятый лимит
   подделывается снаружи угаданным заголовком;
2. туда, где перечислены кешируемые `/articles` и `/cases`, добавить **`/news`** — раздел новый
   (срез C.3). Забыть не смертельно: страницы работают, просто каждый заход идёт в SSR.

---

## Фаза 1. Окно выкатки

### 1.1. Бэкап

```bash
docker exec postgres pg_dump -U <user> <старая_база> | gzip > backup-$(date +%F).sql.gz
```

Отдельно — копия каталога `uploads/`. Бэкап обязателен до всего остального: ETL не проверяет, что
целевая база пуста.

### 1.2. Остановить фронты и старый бек

Данные не должны меняться между ETL и переключением — иначе заявки, пришедшие в старую базу после
переноса, потеряются.

```bash
docker compose stop vals_front admin_vals api
```

### 1.3. Создать новую базу

```bash
docker exec -it postgres psql -U <user> -c "CREATE DATABASE vals_new_db"
```

Старая база остаётся на месте — это и есть план отката.

### 1.4. Загрузить образы

```bash
gunzip -c vals-images-12.09.2026.tar.gz | docker load
```

### 1.5. Правки `.env`

**Добавить** (их сейчас нет — сверено 2026-09-12):

```
NODE_ENV=production
CORS_ORIGINS=https://vals.digital,https://www.vals.digital
MEILI_SEARCH_KEY=<получить на шаге 1.6>
INTERNAL_API_KEY=<ключ из 0.2>
INTERNAL_API_RATE_LIMIT=3000
DB_NAME=vals_new_db
```

`CORS_ORIGINS` — блокер вдвойне: без него приложение не стартует (`z.string().min(1)`), а с неверным
списком `CsrfOriginGuard` отдаёт **403 на все формы заявок и на вход в админку**. Нужны точные
origin сайта, `www` (если живой) и админки.

`NODE_ENV` без значения означает `development`: куки без `Secure`, открытый `/docs`, SQL в логах.

**Удалить** (бек их не читает, а выглядят как рабочие учётные данные): `ADMIN_USERNAME`,
`ADMIN_PASSWORD`. Остальные мёртвые (`APP_CORS_ORIGINS`, `ALLOWED_MUTATION_ORIGINS`, `LOG_TIME`,
`MEILI_INDEX`, `JWT_EXPIRES`, `JWT_REFRESH_EXPIRES`, `REDIS_*`, `MAIL_*`) можно оставить — они просто
игнорируются.

Во фронт (`vals_front` в `docker-compose.yml`, секция `environment`) добавить `INTERNAL_API_KEY=<ключ>`.
Переменная нужна **в рантайме**, пересборка образа ради неё не требуется.

В `docker-compose.yml` обновить теги трёх образов на `12.09.2026`.

### 1.6. Meilisearch и search-ключ

```bash
docker compose up -d meilisearch
```

`MEILI_SEARCH_KEY` не придумывается, а выдаётся самим Meilisearch — забрать ключ с правами `search`:

```bash
curl -s -H "Authorization: Bearer <MEILI_MASTER_KEY>" http://127.0.0.1:7700/keys
```

Вписать в `.env` (шаг 1.5).

### 1.7. Схема и ETL

Поднять контейнер бека **без запуска приложения** либо разово выполнить в нём:

```bash
docker compose run --rm api yarn migration:run
```

ETL требует своих переменных (`SOURCE_DB_*` — старая база, `TARGET_DB_*` — новая,
`SOURCE_IMAGE_LIB_ROOT` — локально доступный `uploads/image-lib/` старого прода):

```bash
docker compose run --rm api yarn migrate:prod-data
```

Порядок жёсткий (`backend_v2/README.md`): бэкап → синхронизация `uploads/media/` → `migration:run`
на **пустую** базу → `migrate:prod-data` → и только потом сид:

```bash
docker compose run --rm api yarn seed:developer
```

Сид раньше ETL столкнётся с `users.id=1` и откатит перенос.

По `uploads/` правок не требуется: nginx раздаёт тот же каталог, что примонтирован в контейнер —
проверить только, что новый контейнер монтирует тот же том.

### 1.8. Поднять бек

```bash
docker compose up -d api
docker compose logs --tail 50 api
```

Проверить: `curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:9002/services/all/short-info` → 200.

### 1.9. Перегенерация HTML материалов (срез X.2)

Сначала отчёт, потом запись — HTML собирается серверной сборкой tiptap, и совпадение с архивом
доказывается на живых данных, а не предполагается:

```bash
docker exec vals_api_v2 npx ts-node src/database/data-migration/regenerate-content-html.script.ts --report
```

Локально расхождений было 3 из 76, все косметические (порядок атрибутов у ячеек таблицы, `&nbsp;`
против байтов `U+00A0`). Если картина похожая — писать:

```bash
docker exec vals_api_v2 npx ts-node src/database/data-migration/regenerate-content-html.script.ts --apply
```

Контрольный прогон `--report` должен дать «совпало побайтово» по всем материалам.

### 1.10. Перенос меты услуг (срез E.2)

Скрипт читает `*.seo.ts` и `*.data.tsx` сайта — в образе бека их нет, поэтому каталог из шага 0.4
кладётся внутрь контейнера:

```bash
docker cp ./services vals_api_v2:/tmp/seo
```

```bash
docker exec vals_api_v2 npx ts-node src/database/data-migration/migrate-service-meta.script.ts --report --source=/tmp/seo
```

Отчёт читается глазами: 18 услуг, у каждой title, description, keywords и h1. Затем запись:

```bash
docker exec vals_api_v2 npx ts-node src/database/data-migration/migrate-service-meta.script.ts --apply --source=/tmp/seo
```

Повторный `--report` должен дать «совпадает с базой: 18». Непустые поля скрипт не перезаписывает без
`--overwrite` — после ETL они пустые, так что флаг не нужен.

### 1.11. Индексация поиска

После ETL индексы Meilisearch пустые. Прогнать `POST /admin/<раздел>/reindex` для пяти разделов:
`articles`, `cases`, `news`, `landings`, `services` — из админки или `curl` с куками админа.

### 1.12. Поднять фронты

Строго после бека:

```bash
docker compose up -d vals_front admin_vals
```

### 1.13. Применить nginx

Правки из 0.5, затем `nginx -t && systemctl reload nginx`.

---

## Фаза 2. Проверки

### 2.1. Тихие поломки — главный класс риска

Эти страницы при ошибке API **не падают и ничего не логируют**, а показывают не тот контент
(`FRONTEND_MIGRATION_PLAN.md`, часть 4):

| Страница | Что будет при ошибке API |
|---|---|
| `/services/{slug}` | вся страница на моках, включая JSON-LD с **моковыми ценами** и моковый FAQ |
| `/` | список услуг подменится захардкоженным `SERVICE_MOK` |
| `/services` | «Произошла ошибка при загрузке услуг» с кодом **200** |
| `/articles`, `/cases` | пустой список с кодом 200 |
| `/sitemap.xml` | 200 и **без единой статьи и кейса** |

Пройти: `/`, `/services`, любую `/services/{slug}`, `/articles`, `/cases`, `/news`, `/faq`,
`/sitemap.xml` — и сверить с админкой. Отдельно: бейдж «Популярный» и порядок тарифов.

### 2.2. Внутренний ключ

1. DevTools → Network: **ни один** запрос из браузера не содержит `X-Internal-Key`.
2. Ctrl+U: значения ключа нет в исходном коде страницы.
3. Снаружи в цикле `curl -H 'X-Internal-Key: <ключ>' https://vals.digital/api/services/all/short-info`
   — лимит обычный (nginx заголовок стёр).
4. Изнутри из контейнера `vals_front` — 200+ запросов подряд без 429.

### 2.3. Кеш новостей

`curl -sI https://vals.digital/news` дважды подряд: на втором запросе статус кеша должен быть `HIT`.
Побочный эффект, о котором стоит предупредить контент-менеджера: после публикации новость появляется
в ленте до десяти минут — так же, как статьи и кейсы.

### 2.4. Приёмка срезов, которая ещё не сделана

- **C:** раздел новостей в админке, лента и страница новости, «Новости по теме».
- **D:** одна заявка с сайта — метки в карточке и в `COMMENTS` Bitrix-пейлоада.
- **X:** сохранить статью с таблицей, списком и callout'ом и биографию сотрудника — сверить
  страницы на сайте.
- **E:** у одной услуги поменять Meta Title и H1 — проверить страницу.
- **A:** вход ролью, заведённой из панели, и проверка, что разделы гейтятся правами.

### 2.5. Формы и заявки

Отправить тестовую заявку с сайта: 200, лид в админке, метки на месте, доставка в Bitrix прошла.
Это же проверяет `CORS_ORIGINS` — при неверном списке будет 403.

---

## Фаза 3. Откат

Старая база не тронута, старые образы на месте:

1. `docker compose stop api vals_front admin_vals`;
2. в `docker-compose.yml` вернуть прежние теги образов, в `.env` — прежнее `DB_NAME`;
3. `docker compose up -d`;
4. откатить nginx (`X-Internal-Key` и `/news` — правки безвредны, но для чистоты).

Заявки, пришедшие уже в новую базу, при откате останутся в ней — забирать вручную. Поэтому окно
выбирается на время без трафика, а решение об откате принимается быстро.

---

## После выкатки

- **E.6** — вычистить мета-часть из 18 файлов `*.seo.ts` (оставив JSON-LD), когда прод подтвердит,
  что мета едет из базы. До тех пор файлы работают фолбэком.
- **Этап 0.5** — CI в `front` и `admin_front` (в `backend_v2` уже есть). Отложен осознанно, но
  история с e2e, которые молча лежали сломанными с X.1, — прямой аргумент завести его сразу после
  выкатки.
- **Prod-образ бека** вместо нынешнего dev-образа с `yarn start:dev`.
- Разобрать ветки и слить их в основные.
