import { MigrationInterface, QueryRunner } from 'typeorm';

// Закрывает находку №1 code review сессии 29 (`_docs/rewrite-log.md`) — `RolesGuard` держал
// reindex/clients.remove/client-leads.retry и весь модуль landings за легаси `@Roles()`, т.к. в
// реестре не было соответствующих кодов (`permission.registry.ts`). Как и
// `1787836749021-AddRolesAndPermissions`, реестр здесь продублирован литералами, не импортом
// (CLAUDE.md §7 — миграции самодостаточны и неизменны).
export class AddContentPermissionsGaps1788336303461 implements MigrationInterface {
  name = 'AddContentPermissionsGaps1788336303461';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO "permissions" ("code", "title", "group") VALUES
        ('landings.read', 'Просмотр нишевых страниц', 'landings'),
        ('landings.write', 'Изменение нишевых страниц', 'landings'),
        ('landings.delete', 'Удаление нишевых страниц', 'landings'),
        ('clients.write', 'Изменение клиентов и заявок', 'clients'),
        ('clients.delete', 'Удаление клиентов', 'clients'),
        ('search.reindex', 'Реиндексация поиска', 'search')
    `);

    // admin — по прежнему весь реестр прав (роль по-прежнему входила во все *_ROLES-массивы,
    // права не меняются, только источник проверки).
    await queryRunner.query(`
      INSERT INTO "role_permissions" ("role_id", "permission_id")
      SELECT (SELECT "id" FROM "roles" WHERE "code" = 'admin'), "id" FROM "permissions"
      WHERE "code" IN (
        'landings.read', 'landings.write', 'landings.delete',
        'clients.write', 'clients.delete', 'search.reindex'
      )
    `);

    // content_manager — landings был в CONTENT_ROLES (role-groups.constant.ts), search.reindex —
    // не был (reindex на всех модулях держали за ADMIN_ROLES строже, чем обычный `*.write`).
    await queryRunner.query(`
      INSERT INTO "role_permissions" ("role_id", "permission_id")
      SELECT (SELECT "id" FROM "roles" WHERE "code" = 'content_manager'), "id" FROM "permissions"
      WHERE "code" LIKE 'landings.%'
    `);

    // client_manager — remove/retry были в CLIENT_ROLES.
    await queryRunner.query(`
      INSERT INTO "role_permissions" ("role_id", "permission_id")
      SELECT (SELECT "id" FROM "roles" WHERE "code" = 'client_manager'), "id" FROM "permissions"
      WHERE "code" IN ('clients.write', 'clients.delete')
    `);
    // developer — is_system, байпас (§1.1) — role_permissions намеренно не трогаем.
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // role_permissions по этим правам удалятся каскадом (FK ON DELETE CASCADE).
    await queryRunner.query(`
      DELETE FROM "permissions" WHERE "code" IN (
        'landings.read', 'landings.write', 'landings.delete',
        'clients.write', 'clients.delete', 'search.reindex'
      )
    `);
  }
}
