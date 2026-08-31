import { MigrationInterface, QueryRunner } from 'typeorm';

// EXPANSION_TASKS.md задача 9 — мета-поля услуг (по образцу articles) + "смотрите также"
// (ServiceRelation, §9 expansion-decisions.md: не M2M — нужен order, которого join-таблица без
// доп. колонок нести не может).
//
// Файл обрезан вручную: `yarn migration:generate` дополнительно предлагал DROP/CREATE не
// относящихся к задаче 9 constraint'ов/индексов на landings/landing_cases/client_leads — миграция
// AddLandings1788164589634 была написана руками с читаемыми именами (`FK_landings_service_id` и
// т.п.), а сущности landing.entity.ts/landing-faq.entity.ts не объявляют эти имена явно через
// @Index(name, ...)/JoinColumn(name), поэтому генератор считает текущие читаемые имена
// "неправильными" и хочет заменить их на свои хэш-имена. Это чисто косметический шум, никак не
// связанный с задачей 9 — не в её объёме (CLAUDE.md §2), и трогать уже применённую миграцию нельзя
// (CLAUDE.md §7). Если понадобится реальная правка индексов/FK на landings — сначала явно назвать
// их в сущностях, тогда генератор перестанет предлагать это же самое при каждом будущем
// migration:generate.
export class AddServiceMetaAndRelations1788190549912 implements MigrationInterface {
  name = 'AddServiceMetaAndRelations1788190549912';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "services" ADD "meta_title" character varying(255)`,
    );
    await queryRunner.query(
      `ALTER TABLE "services" ADD "meta_description" text`,
    );
    await queryRunner.query(`ALTER TABLE "services" ADD "keywords" text`);
    await queryRunner.query(
      `ALTER TABLE "services" ADD "h1" character varying(255)`,
    );

    await queryRunner.query(`
      CREATE TABLE "service_relations" (
        "id" SERIAL NOT NULL,
        "service_id" integer NOT NULL,
        "related_service_id" integer NOT NULL,
        "order" integer NOT NULL,
        CONSTRAINT "PK_service_relations_id" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_service_relations_pair_unique"
        ON "service_relations" ("service_id", "related_service_id")
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_service_relations_order_unique"
        ON "service_relations" ("service_id", "order")
    `);
    // Чисто редакторская ссылка (не структурная зависимость вроде landings.service_id, §10.1) —
    // CASCADE на обеих сторонах, удаление любой из двух услуг просто убирает строку связи.
    await queryRunner.query(`
      ALTER TABLE "service_relations"
        ADD CONSTRAINT "FK_service_relations_service_id" FOREIGN KEY ("service_id")
        REFERENCES "services"("id") ON DELETE CASCADE ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE "service_relations"
        ADD CONSTRAINT "FK_service_relations_related_service_id" FOREIGN KEY ("related_service_id")
        REFERENCES "services"("id") ON DELETE CASCADE ON UPDATE NO ACTION
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "service_relations"`);
    await queryRunner.query(`ALTER TABLE "services" DROP COLUMN "h1"`);
    await queryRunner.query(`ALTER TABLE "services" DROP COLUMN "keywords"`);
    await queryRunner.query(
      `ALTER TABLE "services" DROP COLUMN "meta_description"`,
    );
    await queryRunner.query(`ALTER TABLE "services" DROP COLUMN "meta_title"`);
  }
}
