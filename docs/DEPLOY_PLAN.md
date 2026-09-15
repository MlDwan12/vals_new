# План выкатки: переключение прода на `backend_v2`

Первая редакция — 2026-09-12 (сверка `SWITCH_CHECKLIST.md`, `INFRA_INTERNAL_KEY.md`,
`FRONTEND_MIGRATION_PLAN.md`, `backend_v2/README.md`, `FULLSTACK_PLAN.md`). **Переписан 2026-09-13**
под схему с параллельным стеком — по боевому `docker-compose.yml`, присланному с сервера.

**Что выкатываем:** этап 1 (переключение на `backend_v2`) вместе со срезами A, B, C, D, G, H, X и E
разом.

## Схема

Рядом со старым проектом на сервере поднимается **второй, полностью независимый** compose-проект:
свои postgres, Meilisearch, бек, сайт и админка, свои тома и сети, свои порты на `127.0.0.1`. В его
базу заливается **локальный дамп**, где ETL, перегенерация HTML (X.2) и перенос меты услуг (E.2) уже
сделаны. Старый стек всё это время работает и ничего не знает о новом.

Переключение — только конфигами nginx, в два шага:

1. **Админка** (`valsgroup.online`: `/` и `/api/`) и раздача `/uploads/` — на новый стек. Сайт пока
   старый, проверяем админку на живых данных.
2. **Сайт** (`vals.digital`, `www`: `/` и `/api/`) — на новый стек, чистим кеш nginx.

Откат каждого шага — вернуть конфиг и `reload`: старые контейнеры не останавливаются до конца
проверок.

**Почему порядок безопасен.** Правило «бек не позже админки» (срез X: новая админка не присылает
`contentHtml`) выполняется само: админка ходит в API **по своему домену**, и её `/api/` переключается
вместе с ней. Браузерные запросы старого сайта идут в `vals.digital/api`, который до шага 2 смотрит
в старый бек — перекрёстных запросов между стеками нет.

### Порты и имена

| | Старый стек | Новый стек |
|---|---|---|
| postgres | `postgres`, без портов | `vals_postgres`, без портов |
| Meilisearch | `vals_meilisearch`, без портов | `vals_search`, без портов |
| бек | `vals_api_v2`, `127.0.0.1:9002` | `vals_api`, `127.0.0.1:7101` |
| админка | `admin_vals`, `127.0.0.1:8000` | `vals_admin`, `127.0.0.1:7001` |
| сайт | `vals_digital_v2`, `127.0.0.1:8101` | `vals_front`, `127.0.0.1:7000` |

`container_name` глобальны на весь докер-хост — новые имена не должны совпадать со старыми, иначе
`up` упадёт. То же с портами хоста: оба стека работают одновременно. Сети и тома compose префиксует
именем проекта — в новом compose оно задано явно (`name: vals_v2`), так что с томами старого стека
они не пересекутся при любом имени папки.

Ниже `<OLD>` — каталог старого проекта на сервере, `<NEW>` — каталог нового.

---

## Фаза 0. Локально

### 0.1. Почистить локальную базу перед дампом

Локальная база `test` — это боевой дамп от 2026-09-10 после ETL, X.2 и E.2, но поверх него шла
приёмка срезов. Всё тестовое уедет на прод вместе с дампом.

**Главное — лиды.** Планировщик доставки на новом сервере раз в минуту подхватит каждый лид в статусе
`pending` и отправит его в **боевой** Bitrix. Локально вебхук — заглушка, поэтому тестовые заявки
висят недоставленными. Все перенесённые с прода лиды — `sent` (57 штук), так что всё остальное —
мусор:

```bash
docker exec -it vals_new_postgres psql -U test -d test -c "SELECT id, status, phone_raw, created_at FROM client_leads WHERE status <> 'sent' ORDER BY id"
```

Найденное удалить (`DELETE FROM client_leads WHERE id IN (...)`) — вместе с тестовыми клиентами, если
они больше ни к чему не привязаны.

Остальное — глазами в локальной админке: тестовые новости, статьи, роли и пользователи, файлы в
медиатеке. Пользователь `dev` из сида — удалить или сменить ему пароль на боевой: локальный пароль
из `.env` на прод уходить не должен.

### 0.2. Снять дамп

Бек остановить, чтобы его планировщики ничего не писали во время дампа. Дамп писать **внутри
контейнера** и забирать `docker cp`: перенаправление `>` в PowerShell ломает бинарный вывод
`pg_dump -Fc`.

```bash
docker stop vals_new_api
```

```bash
docker exec vals_new_postgres pg_dump -U test -d test -Fc --no-owner --no-privileges -f /tmp/vals_ready.dump
```

```bash
docker cp vals_new_postgres:/tmp/vals_ready.dump ./vals_ready_13.09.2026.dump
```

```bash
docker start vals_new_api
```

### 0.3. Сгенерировать ключ

```bash
openssl rand -hex 32
```

Пойдёт в `INTERNAL_API_KEY` нового `.env` — compose подставит его и беку, и сайту. Не короче 16
символов, без пробелов по краям.

### 0.4. Собрать образы

Имена — как на сервере, тег — дата выкатки. Бек собирается из **`Dockerfile.prod`**: multi-stage,
`node dist/main`, non-root, `NODE_ENV=production` вшит, есть `HEALTHCHECK`. Dev-образ (`start:dev`
с компиляцией в рантайме) в `mem_limit: 512m` рискует не подняться, а `ts-node` на сервере больше не
нужен: все скрипты переноса уже прогнаны локально.

```bash
docker build -f backend_v2/Dockerfile.prod -t back_vals:13.09.2026 ./backend_v2
```

```bash
docker build -t vals:13.09.2026 --build-arg NEXT_PUBLIC_MODE=prod --build-arg NEXT_PUBLIC_BASE_URL=https://vals.digital/api --build-arg NEXT_PUBLIC_HOST=vals.digital ./front
```

```bash
docker build -t adm_vals:13.09.2026 --build-arg NEXT_PUBLIC_API_URL=https://valsgroup.online/api --build-arg NEXT_PUBLIC_MEDIA_ORIGIN=https://vals.digital ./admin_front
```

- **Сайт:** `NEXT_PUBLIC_BASE_URL` — с `/api` на конце: `apiClient` склеивает `${baseUrl}${path}`, а
  внутренний `http://api:3000` идёт без префикса, значит публичный адрес обязан его содержать.
  `NEXT_PUBLIC_MODE=prod` — тип `'dev' | 'prod'`; в `dev` SSR пошёл бы в публичный URL мимо
  docker-сети и без ключа. `NEXT_PUBLIC_METRIKA_ID` не нужен — чтение переменной в
  `YandexMetrika.tsx` закомментировано.
- `.env*` исключены в `.dockerignore` сайта и админки — локальные `.env.local` в образ не попадут.
- **Админка:** API — **свой домен** `valsgroup.online/api`. `NEXT_PUBLIC_MEDIA_ORIGIN` — origin сайта
  **без пути**: картинки раздаёт nginx `vals.digital`. Старое значение с `/uploads/media/` под новым
  именем склеит путь дважды и уронит всю медиатеку (`SWITCH_CHECKLIST.md` §6).

### 0.5. Проверить prod-образ бека

`Dockerfile.prod` раньше не выкатывался — запустить его против локальной базы, пока это дёшево:

```bash
docker run --rm -d --name vals_prod_smoke --network backend_v2_default --env-file backend_v2/.env -e NODE_ENV=production -e APP_PORT=3000 -e DB_HOST=postgres -e DB_PORT=5432 -e MEILI_HOST=http://meilisearch:7700 -p 127.0.0.1:4200:3000 back_vals:13.09.2026
```

```bash
curl -s http://127.0.0.1:4200/health
```

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:4200/services/all/short-info
```

```bash
docker logs vals_prod_smoke
```

```bash
docker stop vals_prod_smoke
```

Ожидаемо: `/health` отвечает `ok`, ручка — `200`, в логах нет ошибок валидации env и падений модулей.

### 0.6. Выгрузить образы

```bash
docker save -o vals-images-13.09.2026.tar back_vals:13.09.2026 vals:13.09.2026 adm_vals:13.09.2026
```

`-o`, а не `| gzip`: в PowerShell пайп бинарного потока небезопасен.

Залить WinSCP в `<NEW>`: архив образов, дамп из 0.2 и каталог `backend_v2/uploads/media/` (весь
`uploads` локально — 1,5 МБ). Каталог `front/.../services` из прошлой редакции больше не нужен: мета
услуг уже в дампе.

---

## Фаза 1. Сервер, без простоя

### 1.1. Проверить ресурсы

```bash
free -h && df -h
```

Оба стека будут работать одновременно: лимиты нового — около 2,3 ГБ памяти (postgres 768m, бек
512m, сайт 512m, админка 256m, плюс Meilisearch без лимита), столько же у старого.

### 1.2. Бэкап старой базы

Старый стек не трогаем, но копия до начала — обязательна: после удаления старого проекта это будет
единственный след данных до миграции.

```bash
docker exec postgres pg_dump -U <старый DB_USER> -d <старый DB_NAME> -Fc -f /tmp/old_backup.dump
```

```bash
docker cp postgres:/tmp/old_backup.dump <OLD>/old_backup_13.09.2026.dump
```

### 1.3. Каталог `uploads`

```bash
mkdir -p <NEW>/uploads && cp -a <OLD>/uploads/. <NEW>/uploads/
```

```bash
cp -a <NEW>/media/. <NEW>/uploads/media/
```

```bash
sudo chown -R 1000:1000 <NEW>/uploads
```

- Копия старого каталога целиком — чтобы старые ссылки `/uploads/image-lib/...` (поисковики, внешние
  сайты) продолжали открываться после переключения раздачи.
- Локальный `media/` поверх — в нём файлы, которые ETL перенёс из `image-lib` под новыми именями. На
  них ссылается контент в дампе.
- `chown 1000` — prod-образ бека работает под пользователем `node` (uid 1000). Без этого первая же
  загрузка в медиатеку упадёт с `EACCES`.

### 1.4. `.env` нового проекта

Пишется **с нуля**, не копируется с локального (там заглушка Bitrix и dev-режим). Из старого `.env`
переносятся только секреты, которые должны остаться прежними, — `BITRIX_WEBHOOK`, `JWT_SECRET`,
`JWT_REFRESH_SECRET` (или новые — тогда все разлогинятся, это не страшно).

```
NODE_ENV=production
APP_PORT=3000
LOG_LEVEL=info
LOG_PRETTY=false

DB_HOST=postgres
DB_PORT=5432
DB_USER=<новый пользователь>
DB_PASS=<новый пароль>
DB_NAME=vals_db

CORS_ORIGINS=https://vals.digital,https://www.vals.digital,https://valsgroup.online

INTERNAL_API_KEY=<ключ из 0.3>
INTERNAL_API_RATE_LIMIT=3000

JWT_SECRET=<не короче 32 символов>
JWT_REFRESH_SECRET=<другой, не короче 32 символов>

BITRIX_WEBHOOK=<боевой вебхук>

MEILI_HOST=http://meilisearch:7700
MEILI_MASTER_KEY=<новый, не короче 16 символов>
MEILI_SEARCH_KEY=<получить на шаге 1.7>

AUDIT_RETENTION_DAYS=180
```

- `CORS_ORIGINS` — без него бек не стартует, с неполным списком `CsrfOriginGuard` отдаёт 403 на формы
  заявок (`vals.digital`) и на вход в админку (`valsgroup.online`).
- `SEED_*`, `SOURCE_*`, `TARGET_*` не нужны — ни ETL, ни сид на сервере не запускаются.
- `LOG_PRETTY=false` — JSON-логи в `json-file` компактнее и читаются машинно.

### 1.5. `docker-compose.yml` нового проекта

Готовые файлы — `_project/deploy/docker-compose.yml` и `_project/deploy/.env.prod` (на сервере
переименовать в `.env`). В файле compose дополнительно задано `name: vals_v2`: без него имя проекта
берётся из имени папки, и совпадение с папкой старого проекта склеило бы оба стека в один — с общими
томами. Ниже — суть без комментариев.

```yaml
x-logging: &default-logging
  logging:
    driver: "json-file"
    options:
      max-size: "10m"
      max-file: "3"

services:
  postgres:
    <<: *default-logging
    image: postgres:16
    container_name: vals_postgres
    restart: always
    environment:
      POSTGRES_USER: ${DB_USER}
      POSTGRES_PASSWORD: ${DB_PASS}
      POSTGRES_DB: ${DB_NAME}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U $${POSTGRES_USER} -d $${POSTGRES_DB}"]
      interval: 10s
      timeout: 5s
      retries: 5
    mem_limit: 768m
    networks:
      - backend

  meilisearch:
    <<: *default-logging
    image: getmeili/meilisearch:v1.10
    container_name: vals_search
    restart: unless-stopped
    environment:
      MEILI_MASTER_KEY: ${MEILI_MASTER_KEY:?MEILI_MASTER_KEY is required}
      MEILI_ENV: production
      MEILI_NO_ANALYTICS: 'true'
    volumes:
      - meili_data:/meili_data
    networks:
      - backend

  api:
    <<: *default-logging
    image: back_vals:13.09.2026
    container_name: vals_api
    restart: always
    env_file:
      - .env
    ports:
      - '127.0.0.1:7101:3000'
    volumes:
      - ./uploads:/app/uploads
    depends_on:
      postgres:
        condition: service_healthy
      meilisearch:
        condition: service_started
    mem_limit: 512m
    networks:
      - backend
      - frontend_net

  admin_vals:
    <<: *default-logging
    image: adm_vals:13.09.2026
    container_name: vals_admin
    restart: always
    depends_on:
      api:
        condition: service_healthy
    environment:
      NODE_ENV: production
    ports:
      - '127.0.0.1:7001:3000'
    mem_limit: 256m
    networks:
      - frontend_net

  vals_front:
    <<: *default-logging
    image: vals:13.09.2026
    container_name: vals_front
    restart: always
    depends_on:
      api:
        condition: service_healthy
    environment:
      - API_INTERNAL_URL=http://api:3000
      - INTERNAL_API_KEY=${INTERNAL_API_KEY}
      - NODE_ENV=production
      - SITE_HOST=vals.digital
    ports:
      - '127.0.0.1:7000:3000'
    mem_limit: 512m
    networks:
      - frontend_net

networks:
  backend:
    driver: bridge
  frontend_net:
    driver: bridge

volumes:
  postgres_data:
  meili_data:
```

Отличия от старого:

- **Новые `container_name` и порты** — см. таблицу в начале.
- **Meilisearch закреплён на `v1.10`** — та же версия, что локально. С `latest` любой `pull`
  подтянет новую мажорную версию, а формат данных между ними несовместим. `env_file` у него убран:
  контейнеру поиска не нужны пароль БД и JWT-секреты.
- **Healthcheck postgres** читает `POSTGRES_USER`/`POSTGRES_DB`. В старом стояли `$$DB_USER` и
  `$$DB_NAME`, которых внутри контейнера нет — проверка работала случайно, потому что `pg_isready`
  смотрит только на приём соединений.
- **Фронты ждут `service_healthy` бека** — healthcheck зашит в `Dockerfile.prod`.
- **`INTERNAL_API_KEY` сайта** подставляется из того же `.env` — ключ живёт в одном месте.
- Строка `version: '3.8'` убрана: современный compose её игнорирует и предупреждает.

### 1.6. Загрузить образы и восстановить базу

```bash
cd <NEW> && docker load -i vals-images-13.09.2026.tar
```

```bash
docker compose up -d postgres
```

```bash
docker cp vals_ready_13.09.2026.dump vals_postgres:/tmp/vals_ready.dump
```

```bash
docker exec vals_postgres pg_restore -U <DB_USER> -d vals_db --no-owner --no-privileges /tmp/vals_ready.dump
```

Сверка с локальной базой — те же цифры:

```bash
docker exec vals_postgres psql -U <DB_USER> -d vals_db -c "SELECT (SELECT count(*) FROM articles) AS articles, (SELECT count(*) FROM news) AS news, (SELECT count(*) FROM services) AS services, (SELECT count(*) FROM client_leads) AS leads, (SELECT count(*) FROM client_leads WHERE status <> 'sent') AS not_sent"
```

`not_sent` должен быть `0` — иначе вернуться к 0.1, пока бек не поднят.

### 1.7. Meilisearch и search-ключ

```bash
docker compose up -d meilisearch
```

```bash
sudo docker run --rm --network vals_v2_backend curlimages/curl -s -H "Authorization: Bearer $(grep '^MEILI_MASTER_KEY=' .env | cut -d= -f2)" http://meilisearch:7700/keys | grep -o '"name":"Default Search API Key"[^}]*"key":"[^"]*"' | grep -o '"key":"[^"]*"'
```

Значение → в `.env` как `MEILI_SEARCH_KEY`. Порт наружу не проброшен, поэтому запрос идёт из
разового контейнера в сети `vals_v2_backend`; мастер-ключ подставляется из `.env` и не попадает в
историю команд. **Фильтр обязателен:** полный ответ `/keys` содержит и `Default Admin API Key` — на
выкатке он так попал в чат, мастер-ключ пришлось сменить с пересозданием тома Meilisearch.

### 1.8. Поднять бек

```bash
docker compose up -d api
```

```bash
docker compose logs --tail 80 api
```

```bash
curl -s http://127.0.0.1:7101/health
```

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:7101/services/all/short-info
```

**Индексация поиска — сама.** Планировщики переиндексируют статьи, кейсы, новости, лендинги и услуги
каждые 5 минут (`*-reindex.scheduler.ts`), ручной `POST /admin/*/reindex` не нужен. Через 5–10 минут:

```bash
curl -s "http://127.0.0.1:7101/search?q=<слово из заголовка статьи>"
```

В логах бека в первые минуты не должно быть отправок лидов в Bitrix — если они есть, в дамп попал
`pending`.

### 1.9. Поднять сайт и админку

```bash
docker compose up -d
```

```bash
docker ps --format "table {{.Names}}\t{{.Ports}}"
```

У `vals_postgres` и `vals_search` не должно быть стрелки `->` — порты только внутри docker-сети.

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:7000/
```

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:7001/
```

**Посмотреть сайт глазами до переключения** можно через SSH-туннель:

```bash
ssh -L 7000:127.0.0.1:7000 <user>@<сервер>
```

и открыть `http://localhost:7000`. Страницы рендерятся сервером из **новой** базы — видно, что
контент, услуги, тарифы и новости на месте и нет моков (`/`, `/services/{slug}`, `/news`). Картинки
в туннеле не загрузятся (`/uploads` раздаёт nginx), формы уйдут в старый бек — это нормально,
проверяются они после шага 2.

Админку через туннель проверить нельзя: её API вшит как `valsgroup.online/api`, который пока ведёт в
старый бек. Её проверка — шаг 2.1.

---

## Фаза 2. Переключение

### 2.0. Подготовить конфиги

Сделать копии текущих конфигов — это и есть откат:

```bash
sudo cp /etc/nginx/sites-available/<конфиг сайта> /root/nginx-backup-site.conf
```

```bash
sudo cp /etc/nginx/sites-available/<конфиг админки> /root/nginx-backup-admin.conf
```

Путь кеша понадобится на шаге 2.2:

```bash
grep -rn proxy_cache_path /etc/nginx/
```

### 2.1. Шаг 1 — админка и `/uploads/`

В конфиге **`valsgroup.online`**:

- `location /` — `proxy_pass` с `127.0.0.1:8000` на **`127.0.0.1:7001`**;
- `location /api/` — с `127.0.0.1:9002` на **`127.0.0.1:7101`** (слеш на конце `proxy_pass` оставить
  как был — он отрезает префикс `/api`), и внутри добавить:

  ```nginx
  proxy_set_header X-Internal-Key "";
  ```

В конфиге **`vals.digital`** (и `www`, если там отдельный блок):

- `location /uploads/` — путь с `<OLD>/uploads/` на **`<NEW>/uploads/`**.

Раздача переключается уже здесь, потому что новая админка показывает картинки с `vals.digital`: в
старом каталоге нет файлов, перенесённых ETL, и загруженных через новую медиатеку. Старому сайту это
не мешает — новый каталог содержит всё старое (шаг 1.3).

```bash
sudo nginx -t && sudo systemctl reload nginx
```

**Проверка админки:**

- вход под боевой учёткой, роль и видимые разделы соответствуют правам (срез A);
- статьи, кейсы, новости, услуги, тарифы, сотрудники — всё на месте;
- медиатека — картинки видны, загрузка нового файла проходит;
- открыть статью с таблицей/списком/callout'ом и сохранить без изменений — без ошибок (срез X);
- у одной услуги видны Meta Title и H1 из базы (срез E);
- заявки: 57 боевых, статусы `sent`.

**Не публиковать и не править контент по-настоящему** до шага 2: сайт ещё читает старую базу, и
правка покажется «не применившейся».

Откат шага: вернуть оба конфига из `/root/nginx-backup-*.conf`, `reload`.

### 2.2. Шаг 2 — сайт

В конфиге **`vals.digital`** (основной и `www`):

- `location /` — с `127.0.0.1:8101` на **`127.0.0.1:7000`**;
- `location /api/` — с `127.0.0.1:9002` на **`127.0.0.1:7101`**, и внутри:

  ```nginx
  proxy_set_header X-Internal-Key "";
  ```

- кеш `/news` отдельно настраивать не нужно: в боевом конфиге `proxy_cache SSR` стоит на весь
  `location /`, а не на список путей.

```bash
sudo nginx -t && sudo systemctl reload nginx
```

**Сразу же очистить кеш** — иначе до 10 минут (плюс stale-while-revalidate) отдаются страницы,
отрендеренные старым сайтом:

```bash
sudo find <путь из proxy_cache_path> -type f -delete
```

---

## Фаза 3. Проверки после шага 2

### 3.1. Тихие поломки — главный класс риска

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
`/sitemap.xml`, поиск — и сверить с админкой. Отдельно: бейдж «Популярный» и порядок тарифов.

### 3.2. Заявка

Одна заявка с сайта: ответ 200, лид в админке с метками (срез D), доставка в Bitrix прошла, метки в
`COMMENTS`. Это же проверяет `CORS_ORIGINS` — при неверном списке будет 403.

### 3.3. Связка «админка → сайт»

Теперь можно править по-настоящему: поменять Meta Title и H1 у одной услуги (срез E), опубликовать
тестовую новость (срез C) — проверить страницу и «Новости по теме», затем снять. Учитывать кеш: без
очистки изменения видны до 10 минут.

### 3.4. Внутренний ключ

1. DevTools → Network: **ни один** запрос из браузера не содержит `X-Internal-Key`.
2. Ctrl+U: значения ключа нет в исходном коде страницы.
3. Снаружи в цикле `curl -H 'X-Internal-Key: <ключ>' https://vals.digital/api/services/all/short-info`
   — лимит обычный (nginx заголовок стёр).
4. Изнутри: `docker exec vals_front` и 200+ запросов подряд на `http://api:3000/...` с ключом — без
   429.

### 3.5. Кеш новостей

`curl -sI -A "Mozilla/5.0" https://vals.digital/news` дважды подряд: на втором запросе статус кеша —
`HIT`. Без `-A` ответа не будет вовсе: `map $bad_ua` в `nginx.conf` отдаёт 444 на user-agent
`curl|wget|python|...` во всём `location /` сайта (на `/api/` фильтра нет).
Предупредить контент-менеджера: новость появляется в ленте до десяти минут после публикации — так
же, как статьи и кейсы.

---

## Откат

Старый стек работает всё время, пока идут проверки:

1. вернуть конфиги из `~/nginx-backup/` (только сайт — `vals.digital.step1.bak`; всё — `*.bak`) и,
   если старый стек уже остановлен, `cd /var/www/vals.digital && sudo docker compose start`;
2. `sudo nginx -t && sudo systemctl reload nginx`;
3. очистить кеш nginx (как в 2.2).

Заявки и правки, пришедшие в новую базу после переключения, в старой не появятся — забирать вручную
из `vals_postgres`. Поэтому решение об откате принимается быстро.

---

## Фаза 4. Уборка старого стека

**Не в тот же день.** Несколько дней старый стек стоит остановленным — это страховка на случай, если
поломка всплывёт не сразу.

```bash
cd <OLD> && docker compose stop
```

Через несколько дней, когда новый стек подтвердил себя:

1. убедиться, что `old_backup_13.09.2026.dump` (шаг 1.2) на месте, и унести копию с сервера;
2. `cd <OLD> && docker compose down` — контейнеры и сети, **тома остаются**;
3. `docker volume ls` → удалить тома старого проекта (`<OLD-папка>_postgres_data`,
   `<OLD-папка>_meili_data`) — **только после пункта 1**, это единственная копия старой базы;
4. `docker image rm back_vals:18.07.2026 adm_vals:18.07.2026 vals:18.07.2026` и старый образ
   Meilisearch, если больше никем не используется;
5. каталог `<OLD>` — архивировать `uploads/` и `.env`, потом удалить.

---

## Ход выкатки 2026-09-13

Сервер: новый проект — `/var/www/vals_v2`, старый — `/var/www/vals.digital`. `docker` у пользователя
`khantai` только через `sudo`. Бэкапы: старая база — `~/old_backup_13.09.2026.dump`, конфиги nginx до
переключения — `~/nginx-backup/` (`*.bak` — исходные, `vals.digital.step1.bak` — после шага 2.1).
Кеш nginx — `/var/cache/nginx`.

Пройдено: дамп восстановлен (52 / 8 / 18 / 57 лидов, все `sent`), бек, сайт и админка поднялись,
поиск наполнился планировщиками, шаг 2.1 (админка + `/uploads/`) и шаг 2.2 (сайт + очистка кеша)
применены. Проверено снаружи: `/news` 200 и `HIT`, 0 моков на `/services`, 52 статьи в sitemap;
`X-Internal-Key` — изнутри 150 запросов без отказа, снаружи с настоящим ключом 100×200 и 10×429
(nginx заголовок стёр).

Что всплыло:

1. **Вход под `Khantai` — 401.** Бек приводит логин к нижнему регистру (`normalizeUsername`) и ищет
   точное совпадение, а ETL переносил логин как есть. Исправлено на проде
   `UPDATE users SET username = lower(trim(username)) ...`, в локальной базе тем же запросом и в
   `migrate-prod-data.script.ts` (логин пишется в нижнем регистре). Хеши bcrypt совместимы — сверены
   побайтово с боевым дампом.
2. **Админский ключ Meilisearch попал в чат** из полного ответа `/keys` — мастер-ключ сменён,
   том пересоздан (поиск был ещё пуст). Команда в 1.7 теперь фильтрует вывод.
3. **Шаг 1.3 был пропущен** — бек поднялся с `uploads`, где не было `image-lib`, а владельцем был
   `1001`. Чтение работало, запись в медиатеку упала бы. Досделано до переключения nginx.
4. **Проверки `curl` через nginx молча пустые** — фильтр `$bad_ua`, см. 3.5.
5. **Порты** сменены с плановых на `7000` (сайт), `7001` (админка), `7101` (бек): `8101` занят
   старым сайтом.

---

## После выкатки

- **E.6** — вычистить мета-часть из 18 файлов `*.seo.ts` (оставив JSON-LD), когда прод подтвердит,
  что мета едет из базы. До тех пор файлы работают фолбэком.
- **Этап 0.5** — CI в `front` и `admin_front` (в `backend_v2` уже есть). Отложен осознанно, но
  история с e2e, которые молча лежали сломанными с X.1, — прямой аргумент завести его сразу после
  выкатки.
- Разобрать ветки и слить их в основные.
- В `backend_v2/docker-compose.yml` (он dev) и документации отметить, что прод собирается из
  `Dockerfile.prod`.
