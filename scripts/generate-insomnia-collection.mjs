#!/usr/bin/env node
// Собирает insomnia.json (нативный экспорт-формат Insomnia — не сырой OpenAPI) из живого
// /docs-json приложения. Нужен отдельно от Swagger: импорт голого OpenAPI-файла Insomnia (8+)
// открывает как "Design Document" (просмотр/редактирование спеки), а не как коллекцию запросов —
// нативный формат импортируется сразу коллекцией с папками по контроллерам, как было в старом
// vals_api/insomnia.json.
//
// Запуск: node scripts/generate-insomnia-collection.mjs [openapi-url-или-путь-к-файлу]
// По умолчанию — http://localhost:3000/docs-json (приложение должно быть запущено).

import { writeFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_PATH = join(__dirname, '..', 'insomnia.json');
const source = process.argv[2] ?? 'http://localhost:3000/docs-json';

// Примеры тел запросов по имени DTO — реальные обязательные поля из class-validator-декораторов
// (Swagger их не знает, ни на одном DTO в проекте нет @ApiProperty, см. rewrite-log). Для
// UpdateXDto без отдельной записи используется тело CreateXDto (PartialType — те же поля).
const BODY_EXAMPLES = {
  LoginDto: { username: 'developer', password: 'changeme' },
  CreateArticleDto: {
    slug: 'example-article',
    title: 'Заголовок статьи',
    content: { type: 'doc', content: [] },
    authorIds: [1],
    tagIds: [1],
    datePublished: '2020-01-01T00:00:00.000Z',
  },
  CreateArticleFaqDto: { articleId: 1, question: 'Вопрос?', answer: 'Ответ.' },
  CreateCaseDto: {
    slug: 'example-case',
    title: 'Заголовок кейса',
    problem: 'Проблема клиента',
    result: 'Результат работы',
    industry: ['IT'],
    serviceIds: [1],
    authorIds: [1],
    datePublished: '2020-01-01T00:00:00.000Z',
  },
  CreateCaseFaqDto: { caseId: 1, question: 'Вопрос?', answer: 'Ответ.' },
  CreateEmployeeDto: {
    slug: 'example-employee',
    name: 'Имя Фамилия',
    position: 'Должность',
  },
  CreateTagDto: { slug: 'example-tag', name: 'Название тега' },
  CreateServiceDto: {
    slug: 'example-service',
    categoryId: 1,
    title: 'Название услуги',
    description: 'Полное описание',
    subDescription: 'Короткое описание',
    icon: 'shield',
  },
  CreateServiceCategoryDto: { name: 'Название категории' },
  CreateServiceStepDto: {
    step: 1,
    title: 'Название шага',
    description: 'Описание шага',
    serviceId: 1,
  },
  CreateServiceFaqDto: { serviceId: 1, question: 'Вопрос?', answer: 'Ответ.' },
  CreateTariffDto: {
    serviceId: 1,
    name: 'Базовый',
    from: 'от',
    features: 'Пункт 1||Пункт 2',
    basePrice: 50000,
    periodIds: [1],
  },
  CreateTariffPeriodDto: { months: 1 },
  CreateIndustryDto: { name: 'FinTech' },
  CreateLeadDto: {
    name: 'Имя клиента',
    phone: '+79990001122',
    type: 'FREE_CONSULTATION',
    message: 'Текст обращения',
  },
  CreateUserDto: { username: 'new_user', password: 'ChangeMe123!' },
};

function resolveBodyExample(dtoName) {
  if (BODY_EXAMPLES[dtoName]) return BODY_EXAMPLES[dtoName];
  if (dtoName.startsWith('Update')) {
    const createName = dtoName.replace(/^Update/, 'Create');
    if (BODY_EXAMPLES[createName]) return BODY_EXAMPLES[createName];
  }
  return null;
}

function exampleForParam(param) {
  const type = param.schema?.type;
  if (type === 'number' || type === 'integer') return '1';
  return 'example-slug';
}

function buildUrl(path, parameters) {
  let url = path;
  for (const param of parameters ?? []) {
    if (param.in === 'path') {
      url = url.replace(`{${param.name}}`, exampleForParam(param));
    }
  }
  return `{{ base_url }}${url}`;
}

function operationName(method, path) {
  const label = { get: 'Get', post: 'Create', patch: 'Update', delete: 'Delete', put: 'Replace' }[
    method
  ] ?? method.toUpperCase();
  const tail = path.split('/').filter(Boolean).pop() ?? '';
  const isDynamic = tail.startsWith('{');
  return isDynamic ? `${label} by id` : `${label} — ${path}`;
}

async function loadOpenApi(src) {
  if (/^https?:\/\//.test(src)) {
    const res = await fetch(src);
    if (!res.ok) {
      throw new Error(`Не удалось получить ${src}: HTTP ${res.status}`);
    }
    return res.json();
  }
  return JSON.parse(readFileSync(src, 'utf8'));
}

async function main() {
  const spec = await loadOpenApi(source);
  const resources = [];

  const workspaceId = 'wrk_vals_new';
  resources.push({
    _id: workspaceId,
    _type: 'workspace',
    parentId: null,
    name: 'VALS.DIGITAL (vals_new)',
    description: `Сгенерировано из ${source} — ${new Date().toISOString()}`,
  });

  resources.push({
    _id: 'env_base',
    _type: 'environment',
    parentId: workspaceId,
    name: 'Local',
    data: { base_url: 'http://localhost:3000' },
    color: '#4552d6',
    isPrivate: false,
  });

  const folderIdByTag = new Map();
  let requestCounter = 0;

  for (const [path, methods] of Object.entries(spec.paths)) {
    for (const [method, operation] of Object.entries(methods)) {
      if (!['get', 'post', 'patch', 'put', 'delete'].includes(method)) continue;

      const tag = operation.tags?.[0] ?? 'Other';
      if (!folderIdByTag.has(tag)) {
        const folderId = `fld_${tag.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`;
        folderIdByTag.set(tag, folderId);
        resources.push({
          _id: folderId,
          _type: 'request_group',
          parentId: workspaceId,
          name: tag,
        });
      }

      const dtoRef =
        operation.requestBody?.content?.['application/json']?.schema?.['$ref'];
      const dtoName = dtoRef ? dtoRef.split('/').pop() : null;
      const example = dtoName ? resolveBodyExample(dtoName) : null;

      const headers = [];
      let body = {};
      if (operation.requestBody) {
        headers.push({ name: 'Content-Type', value: 'application/json' });
        body = {
          mimeType: 'application/json',
          text: JSON.stringify(example ?? {}, null, 2),
        };
      }

      requestCounter += 1;
      resources.push({
        _id: `req_${requestCounter}_${operation.operationId ?? method}`,
        _type: 'request',
        parentId: folderIdByTag.get(tag),
        name: operationName(method, path),
        method: method.toUpperCase(),
        url: buildUrl(path, operation.parameters),
        headers,
        body,
        parameters: [],
      });
    }
  }

  const doc = {
    _type: 'export',
    __export_format: 4,
    __export_date: new Date().toISOString(),
    __export_source: 'vals_new:generate-insomnia-collection',
    resources,
  };

  writeFileSync(OUTPUT_PATH, JSON.stringify(doc, null, 2) + '\n', 'utf8');
  console.log(
    `insomnia.json готов: ${resources.length} ресурсов (${folderIdByTag.size} папок, ${requestCounter} запросов).`,
  );
}

main().catch((error) => {
  console.error('Не удалось собрать коллекцию для Insomnia:', error.message);
  process.exitCode = 1;
});
