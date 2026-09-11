import { MigrationInterface, QueryRunner } from 'typeorm';

// Бессрочный доступ в панель (access_expires_at = NULL) перестаёт быть значением по умолчанию,
// которое может выставить любой держатель users.manage, и становится отдельным правом.
// Владелец просил: выдавать бессрочный доступ может только он — высшая роль, «Главный
// разработчик».
//
// Право НИ ОДНОЙ роли явно не выдаётся, в том числе admin (в отличие от предыдущих миграций,
// где admin получал весь новый реестр): единственный, кто его проходит, — держатель системной
// роли, а он проходит любую проверку @Perm() байпасом (EXPANSION_TASKS.md §1.1). Захотят выдать
// кому-то ещё — чекбокс в разделе «Роли», отдельная миграция для этого не нужна.
//
// Реестр здесь продублирован литералами, не импортом из permission.registry.ts (CLAUDE.md §7 —
// миграции самодостаточны и неизменны).
export class AddPermanentAccessPermission1789108881407 implements MigrationInterface {
  name = 'AddPermanentAccessPermission1789108881407';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO "permissions" ("code", "title", "group") VALUES
        ('users.grant_permanent_access', 'Выдача бессрочного доступа', 'users')
    `);

    // Высшая роль называется своим именем: «Разработчик» читалось как одна из рабочих ролей,
    // хотя это владелец системы — единственный, кто проходит любую проверку прав байпасом.
    await queryRunner.query(`
      UPDATE "roles" SET "title" = 'Главный разработчик' WHERE "code" = 'developer'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // role_permissions по этому праву удалятся каскадом (FK ON DELETE CASCADE) — если право
    // всё-таки успели выдать какой-то роли явно.
    await queryRunner.query(`
      DELETE FROM "permissions" WHERE "code" = 'users.grant_permanent_access'
    `);
    await queryRunner.query(`
      UPDATE "roles" SET "title" = 'Разработчик' WHERE "code" = 'developer'
    `);
  }
}
