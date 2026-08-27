import { MigrationInterface, QueryRunner } from 'typeorm';

// EXPANSION_TASKS.md, задача 1 — роли/права из БД вместо фиксированного enum. Реестр прав здесь
// продублирован как литеральные значения (не импортирует core/permissions/permission.registry.ts)
// — миграции должны оставаться неизменными и самодостаточными, даже если реестр в коде когда-либо
// изменится (CLAUDE.md §7).
export class AddRolesAndPermissions1787836749021 implements MigrationInterface {
  name = 'AddRolesAndPermissions1787836749021';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "permissions" ("id" SERIAL NOT NULL, "code" character varying(64) NOT NULL, "title" character varying(255) NOT NULL, "group" character varying(64) NOT NULL, CONSTRAINT "PK_920331560282b8bd21bb02290df" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_8dad765629e83229da6feda1c1" ON "permissions" ("code")`,
    );
    await queryRunner.query(
      `CREATE TABLE "roles" ("id" SERIAL NOT NULL, "code" character varying(64) NOT NULL, "title" character varying(255) NOT NULL, "description" text, "rank" integer NOT NULL, "is_system" boolean NOT NULL DEFAULT false, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_c1433d71a4838793a49dcad46ab" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_f6d54f95c31b73fb1bdd8e91d0" ON "roles" ("code")`,
    );
    await queryRunner.query(
      `CREATE TABLE "role_permissions" ("role_id" integer NOT NULL, "permission_id" integer NOT NULL, CONSTRAINT "PK_25d24010f53bb80b78e412c9656" PRIMARY KEY ("role_id", "permission_id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_178199805b901ccd220ab7740e" ON "role_permissions" ("role_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_17022daf3f885f7d35423e9971" ON "role_permissions" ("permission_id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "role_permissions" ADD CONSTRAINT "FK_178199805b901ccd220ab7740ec" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "role_permissions" ADD CONSTRAINT "FK_17022daf3f885f7d35423e9971e" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    );

    // Реестр прав (EXPANSION_TASKS.md §1.2) — group берётся из части кода до точки.
    await queryRunner.query(`
      INSERT INTO "permissions" ("code", "title", "group") VALUES
        ('articles.read', 'Просмотр статей', 'articles'),
        ('articles.write', 'Изменение статей', 'articles'),
        ('articles.delete', 'Удаление статей', 'articles'),
        ('news.read', 'Просмотр новостей', 'news'),
        ('news.write', 'Изменение новостей', 'news'),
        ('news.delete', 'Удаление новостей', 'news'),
        ('cases.read', 'Просмотр кейсов', 'cases'),
        ('cases.write', 'Изменение кейсов', 'cases'),
        ('cases.delete', 'Удаление кейсов', 'cases'),
        ('services.read', 'Просмотр услуг', 'services'),
        ('services.write', 'Изменение услуг', 'services'),
        ('services.delete', 'Удаление услуг', 'services'),
        ('media.read', 'Просмотр медиатеки', 'media'),
        ('media.write', 'Загрузка в медиатеку', 'media'),
        ('media.delete', 'Удаление из медиатеки', 'media'),
        ('tags.read', 'Просмотр тегов', 'tags'),
        ('tags.write', 'Изменение тегов', 'tags'),
        ('tags.delete', 'Удаление тегов', 'tags'),
        ('employees.read', 'Просмотр сотрудников', 'employees'),
        ('employees.write', 'Изменение сотрудников', 'employees'),
        ('employees.delete', 'Удаление сотрудников', 'employees'),
        ('clients.read', 'Просмотр клиентов и заявок', 'clients'),
        ('clients.export', 'Экспорт клиентов', 'clients'),
        ('users.manage', 'Управление пользователями', 'users'),
        ('users.reset_password', 'Сброс пароля пользователя', 'users'),
        ('roles.manage', 'Управление ролями и правами', 'roles'),
        ('audit.read', 'Просмотр журнала действий', 'audit')
    `);

    // 4 нынешние роли — те же коды, что у старого enum, чтобы существующие пользователи
    // привязались к ним по значению (EXPANSION_TASKS.md §1.7).
    await queryRunner.query(`
      INSERT INTO "roles" ("code", "title", "rank", "is_system") VALUES
        ('developer', 'Разработчик', 100, true),
        ('admin', 'Администратор', 80, false),
        ('content_manager', 'Контент-менеджер', 40, false),
        ('client_manager', 'Менеджер по клиентам', 40, false)
    `);

    // admin — сегодня входит и в ADMIN_ROLES, и в CONTENT_ROLES, и в CLIENT_ROLES
    // (role-groups.constant.ts) — весь реестр прав, права не изменились.
    await queryRunner.query(`
      INSERT INTO "role_permissions" ("role_id", "permission_id")
      SELECT (SELECT "id" FROM "roles" WHERE "code" = 'admin'), "id" FROM "permissions"
    `);

    // content_manager — сегодня CONTENT_ROLES: articles/cases/services (включая
    // tariffs/tariff-periods/industries/service-steps/service-categories/service-faq —
    // разделы панели "Услуги", не отдельные коды)/media/tags/employees/news.
    await queryRunner.query(`
      INSERT INTO "role_permissions" ("role_id", "permission_id")
      SELECT (SELECT "id" FROM "roles" WHERE "code" = 'content_manager'), "id" FROM "permissions"
      WHERE "code" LIKE 'articles.%' OR "code" LIKE 'news.%' OR "code" LIKE 'cases.%'
         OR "code" LIKE 'services.%' OR "code" LIKE 'media.%' OR "code" LIKE 'tags.%'
         OR "code" LIKE 'employees.%'
    `);

    // client_manager — сегодня CLIENT_ROLES: только clients.*.
    await queryRunner.query(`
      INSERT INTO "role_permissions" ("role_id", "permission_id")
      SELECT (SELECT "id" FROM "roles" WHERE "code" = 'client_manager'), "id" FROM "permissions"
      WHERE "code" LIKE 'clients.%'
    `);
    // developer — is_system, байпас (§1.1) — role_permissions намеренно пусты.

    // role_id — сначала nullable, чтобы переложить значения из старого role, только потом NOT NULL
    // (таблица users не обязательно пуста — реальные пользователи уже могут существовать).
    await queryRunner.query(`ALTER TABLE "users" ADD "role_id" integer`);
    await queryRunner.query(`
      UPDATE "users" SET "role_id" = (SELECT "id" FROM "roles" WHERE "roles"."code" = "users"."role")
    `);
    await queryRunner.query(
      `ALTER TABLE "users" ALTER COLUMN "role_id" SET NOT NULL`,
    );

    await queryRunner.query(
      `DROP INDEX "public"."IDX_ace513fa30d485cfd25c11a9e4"`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" DROP CONSTRAINT "CHK_cd5b95daa0efbeea29b858b7dd"`,
    );
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "role"`);

    await queryRunner.query(
      `ALTER TABLE "users" ADD "access_expires_at" TIMESTAMP WITH TIME ZONE`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD CONSTRAINT "FK_a2cecd1a3531c0b041e29ba46e1" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" DROP CONSTRAINT "FK_a2cecd1a3531c0b041e29ba46e1"`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN "access_expires_at"`,
    );

    await queryRunner.query(
      `ALTER TABLE "users" ADD "role" character varying(32)`,
    );
    await queryRunner.query(`
      UPDATE "users" SET "role" = (SELECT "code" FROM "roles" WHERE "roles"."id" = "users"."role_id")
    `);
    await queryRunner.query(
      `ALTER TABLE "users" ALTER COLUMN "role" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'content_manager'`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD CONSTRAINT "CHK_cd5b95daa0efbeea29b858b7dd" CHECK (((role)::text = ANY ((ARRAY['developer'::character varying, 'admin'::character varying, 'content_manager'::character varying, 'client_manager'::character varying])::text[])))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_ace513fa30d485cfd25c11a9e4" ON "users" USING btree ("role")`,
    );

    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "role_id"`);

    await queryRunner.query(
      `ALTER TABLE "role_permissions" DROP CONSTRAINT "FK_17022daf3f885f7d35423e9971e"`,
    );
    await queryRunner.query(
      `ALTER TABLE "role_permissions" DROP CONSTRAINT "FK_178199805b901ccd220ab7740ec"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_17022daf3f885f7d35423e9971"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_178199805b901ccd220ab7740e"`,
    );
    await queryRunner.query(`DROP TABLE "role_permissions"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_f6d54f95c31b73fb1bdd8e91d0"`,
    );
    await queryRunner.query(`DROP TABLE "roles"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_8dad765629e83229da6feda1c1"`,
    );
    await queryRunner.query(`DROP TABLE "permissions"`);
  }
}
