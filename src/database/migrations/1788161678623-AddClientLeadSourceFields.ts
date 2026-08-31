import { MigrationInterface, QueryRunner } from 'typeorm';

// EXPANSION_TASKS.md §6 (внутренние метки форм) + §7 (источник перехода) — оба набора полей на
// client_leads, реализованы в одной сессии одной миграцией (независимые задачи документа, но
// трогают одну и ту же таблицу).
export class AddClientLeadSourceFields1788161678623 implements MigrationInterface {
  name = 'AddClientLeadSourceFields1788161678623';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "client_leads" ADD "form_id" character varying(64)`,
    );
    await queryRunner.query(
      `ALTER TABLE "client_leads" ADD "page_path" character varying(500)`,
    );
    await queryRunner.query(
      `ALTER TABLE "client_leads" ADD "referrer" character varying(2048)`,
    );
    await queryRunner.query(
      `ALTER TABLE "client_leads" ADD "landing_path" character varying(500)`,
    );
    await queryRunner.query(
      `ALTER TABLE "client_leads" ADD "user_agent" character varying(512)`,
    );
    // page_path — свободный текст (URL), почти уникален построчно, без @Index(): индекс на нём не
    // окупает стоимость на каждой вставке. form_id — закрытый набор FORM_IDS (по факту единицы
    // значений), индекс под точный фильтр в админке оправдан.
    await queryRunner.query(
      `CREATE INDEX "IDX_client_leads_form_id" ON "client_leads" ("form_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_client_leads_form_id"`);
    await queryRunner.query(
      `ALTER TABLE "client_leads" DROP COLUMN "user_agent"`,
    );
    await queryRunner.query(
      `ALTER TABLE "client_leads" DROP COLUMN "landing_path"`,
    );
    await queryRunner.query(
      `ALTER TABLE "client_leads" DROP COLUMN "referrer"`,
    );
    await queryRunner.query(
      `ALTER TABLE "client_leads" DROP COLUMN "page_path"`,
    );
    await queryRunner.query(`ALTER TABLE "client_leads" DROP COLUMN "form_id"`);
  }
}
