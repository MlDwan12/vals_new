import { MigrationInterface, QueryRunner } from 'typeorm';

// EXPANSION_TASKS.md задача 10 — нишевые страницы под услуги. Схема + join-таблица с кейсами;
// content/content_html — тот же паттерн, что сейчас у articles/cases/news (задача 5 не реализована,
// contentHtml приходит от клиента напрямую). service_id/industry_id — RESTRICT (§10.1
// expansion-decisions.md), UNIQUE(service_id, slug) — не глобальный (§10.2).
export class AddLandings1788164589634 implements MigrationInterface {
  name = 'AddLandings1788164589634';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "landings" (
        "id" SERIAL NOT NULL,
        "service_id" integer NOT NULL,
        "industry_id" integer NOT NULL,
        "slug" character varying(255) NOT NULL,
        "title" character varying(255) NOT NULL,
        "h1" character varying(255) NOT NULL,
        "subtitle" text,
        "content" jsonb NOT NULL,
        "content_html" text,
        "meta_title" character varying(255),
        "meta_description" text,
        "keywords" text,
        "advantages" text array,
        "cta_title" text,
        "cta_subtitle" text,
        "cta_button_text" text,
        "cover_media_id" integer,
        "is_published" boolean NOT NULL DEFAULT false,
        "priority" integer NOT NULL DEFAULT 0,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_landings_id" PRIMARY KEY ("id")
      )
    `);
    // Составной unique, не глобальный (§10.2) — заодно служит индексом под точечный лукап
    // по service_id (leftmost prefix), отдельный индекс на service_id не нужен.
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_landings_service_id_slug" ON "landings" ("service_id", "slug")
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_landings_industry_id" ON "landings" ("industry_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_landings_cover_media_id" ON "landings" ("cover_media_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_landings_priority" ON "landings" ("priority")`,
    );
    await queryRunner.query(`
      ALTER TABLE "landings"
        ADD CONSTRAINT "FK_landings_service_id" FOREIGN KEY ("service_id")
        REFERENCES "services"("id") ON DELETE RESTRICT ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE "landings"
        ADD CONSTRAINT "FK_landings_industry_id" FOREIGN KEY ("industry_id")
        REFERENCES "industries"("id") ON DELETE RESTRICT ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE "landings"
        ADD CONSTRAINT "FK_landings_cover_media_id" FOREIGN KEY ("cover_media_id")
        REFERENCES "media"("id") ON DELETE SET NULL ON UPDATE NO ACTION
    `);

    // FAQ — по образцу service_faq (без индекса на landing_id, тот же прецедент: маленькая
    // таблица на родителя, последовательное сканирование достаточно).
    await queryRunner.query(`
      CREATE TABLE "landing_faq" (
        "id" SERIAL NOT NULL,
        "landing_id" integer NOT NULL,
        "question" text NOT NULL,
        "answer" text NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_landing_faq_id" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      ALTER TABLE "landing_faq"
        ADD CONSTRAINT "FK_landing_faq_landing_id" FOREIGN KEY ("landing_id")
        REFERENCES "landings"("id") ON DELETE CASCADE ON UPDATE NO ACTION
    `);

    // Связанные кейсы — опционально, без порядка (M2M), по образцу service_to_case/article_tags:
    // составной PK + отдельный индекс на каждую колонку join-таблицы.
    await queryRunner.query(`
      CREATE TABLE "landing_cases" (
        "landing_id" integer NOT NULL,
        "case_id" integer NOT NULL,
        CONSTRAINT "PK_landing_cases" PRIMARY KEY ("landing_id", "case_id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_landing_cases_landing_id" ON "landing_cases" ("landing_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_landing_cases_case_id" ON "landing_cases" ("case_id")`,
    );
    await queryRunner.query(`
      ALTER TABLE "landing_cases"
        ADD CONSTRAINT "FK_landing_cases_landing_id" FOREIGN KEY ("landing_id")
        REFERENCES "landings"("id") ON DELETE CASCADE ON UPDATE CASCADE
    `);
    await queryRunner.query(`
      ALTER TABLE "landing_cases"
        ADD CONSTRAINT "FK_landing_cases_case_id" FOREIGN KEY ("case_id")
        REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE NO ACTION
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "landing_cases"`);
    await queryRunner.query(`DROP TABLE "landing_faq"`);
    await queryRunner.query(`DROP TABLE "landings"`);
  }
}
