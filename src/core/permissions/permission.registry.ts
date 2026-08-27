// Единый реестр кодов прав (EXPANSION_TASKS.md, задача 1, §1.2) — `as const`, опечатка в коде
// права должна быть ошибкой компиляции, не молча незакрытой ручкой. Сидится в БД миграцией
// `AddRolesAndPermissions*`, из панели не редактируется — правки реестра только здесь и только
// новой миграцией.
//
// Гранулярность — по разделам админ-панели, не по таблицам БД: tariffs/tariff-periods/industries/
// service-steps/service-categories/service-faq — всё раздел "Услуги" панели, под services.*;
// article-faq/case-faq — подресурс своего типа контента, под articles.*/cases.* соответственно.
// `news.*` сидится уже сейчас, хотя модуля новостей ещё нет (задача 3 EXPANSION_TASKS.md).
export const PERMISSIONS = {
  ARTICLES_READ: 'articles.read',
  ARTICLES_WRITE: 'articles.write',
  ARTICLES_DELETE: 'articles.delete',
  NEWS_READ: 'news.read',
  NEWS_WRITE: 'news.write',
  NEWS_DELETE: 'news.delete',
  CASES_READ: 'cases.read',
  CASES_WRITE: 'cases.write',
  CASES_DELETE: 'cases.delete',
  SERVICES_READ: 'services.read',
  SERVICES_WRITE: 'services.write',
  SERVICES_DELETE: 'services.delete',
  MEDIA_READ: 'media.read',
  MEDIA_WRITE: 'media.write',
  MEDIA_DELETE: 'media.delete',
  TAGS_READ: 'tags.read',
  TAGS_WRITE: 'tags.write',
  TAGS_DELETE: 'tags.delete',
  EMPLOYEES_READ: 'employees.read',
  EMPLOYEES_WRITE: 'employees.write',
  EMPLOYEES_DELETE: 'employees.delete',
  CLIENTS_READ: 'clients.read',
  CLIENTS_EXPORT: 'clients.export',
  USERS_MANAGE: 'users.manage',
  // Отдельный код от USERS_MANAGE (EXPANSION_TASKS.md §1.6) — сброс чужого пароля отдаёт чужую
  // личность, это доверие другого уровня, чем обычная правка учётки.
  USERS_RESET_PASSWORD: 'users.reset_password',
  ROLES_MANAGE: 'roles.manage',
  AUDIT_READ: 'audit.read',
} as const;

export type PermissionCode = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

const KNOWN_PERMISSION_CODES = new Set<string>(Object.values(PERMISSIONS));

// Единственная точка сужения string (сырой permissions.code из БД) -> PermissionCode — без нового
// кода в реестре в базе появиться неоткуда (permissions заводится только сидом-миграцией), но
// прямой `as PermissionCode` над результатом запроса запрещён CLAUDE.md §3, а руками сверять
// с PERMISSIONS в каждом месте — дублирование (найдено /code-review high). Используется как
// предикат для .filter() — неизвестный код (испорченные данные/устаревшая строка после правки
// реестра) тихо выпадает, не проходит в набор прав пользователя (безопасное направление —
// меньше прав, не больше).
export function isPermissionCode(code: string): code is PermissionCode {
  return KNOWN_PERMISSION_CODES.has(code);
}
