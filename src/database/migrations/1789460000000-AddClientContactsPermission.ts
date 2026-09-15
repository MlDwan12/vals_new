import { MigrationInterface, QueryRunner } from 'typeorm';

// Раздел «Заявки» в админке (задача 6): телефон и почта в ответах замаскированы, полные контакты
// отдаются отдельной ручкой под этим правом, и каждый просмотр попадает в журнал действий.
//
// Выдаётся admin и client_manager — тем, кто и так работает с заявками (у обеих ролей есть
// clients.read). developer — is_system, проходит любую проверку байпасом, role_permissions не
// трогаем. Роли, заведённые из панели, право не получают: выдать можно чекбоксом в разделе «Роли».
//
// Декартово произведение, а не подзапрос на роль в VALUES: если какой-то из ролей на стенде нет,
// строка для неё просто не появится, а не упадёт на NOT NULL role_id.
//
// Коды продублированы литералами, не импортом из permission.registry.ts (CLAUDE.md §7 — миграции
// самодостаточны и неизменны).
export class AddClientContactsPermission1789460000000 implements MigrationInterface {
  name = 'AddClientContactsPermission1789460000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO "permissions" ("code", "title", "group") VALUES
        ('clients.view_contacts', 'Просмотр контактов клиентов', 'clients')
    `);

    await queryRunner.query(`
      INSERT INTO "role_permissions" ("role_id", "permission_id")
      SELECT "roles"."id", "permissions"."id"
      FROM "roles", "permissions"
      WHERE "roles"."code" IN ('admin', 'client_manager')
        AND "permissions"."code" = 'clients.view_contacts'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // role_permissions по этому праву удалятся каскадом (FK ON DELETE CASCADE).
    await queryRunner.query(`
      DELETE FROM "permissions" WHERE "code" = 'clients.view_contacts'
    `);
  }
}
