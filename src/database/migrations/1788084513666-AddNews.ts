import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddNews1788084513666 implements MigrationInterface {
  name = 'AddNews1788084513666';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "news" ("id" SERIAL NOT NULL, "slug" character varying(255) NOT NULL, "title" character varying(255) NOT NULL, "announce" text, "content" jsonb NOT NULL, "content_html" text, "meta_title" character varying(255), "meta_description" text, "keywords" text, "date_published" TIMESTAMP WITH TIME ZONE, "priority" integer NOT NULL DEFAULT '0', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "cover_media_id" integer, CONSTRAINT "PK_39a43dfcb6007180f04aff2357e" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_d09152c44881b7620e12d6df09" ON "news"  ("slug") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_577312b7a63c52d081bb4f24c6" ON "news"  ("date_published") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_030a7be1878b413ab7dfaccf30" ON "news"  ("priority") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_53587e49282ab1b2d11f40ea23" ON "news"  ("cover_media_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "news_authors" ("news_id" integer NOT NULL, "employee_id" integer NOT NULL, CONSTRAINT "PK_21982d47c32fb1457819275a7d3" PRIMARY KEY ("news_id", "employee_id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_48294f38620aff71b127b786e9" ON "news_authors"  ("news_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_68b0634801fad56c09e7c7b8b2" ON "news_authors"  ("employee_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "news_tags" ("news_id" integer NOT NULL, "tag_id" integer NOT NULL, CONSTRAINT "PK_051c16fcdeb041776091b604bd7" PRIMARY KEY ("news_id", "tag_id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_afe9599f04a11fd263c28db556" ON "news_tags"  ("news_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_e98737624b91ccba0ce3268467" ON "news_tags"  ("tag_id") `,
    );
    await queryRunner.query(
      `ALTER TABLE "news" ADD CONSTRAINT "FK_53587e49282ab1b2d11f40ea23f" FOREIGN KEY ("cover_media_id") REFERENCES "media"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "news_authors" ADD CONSTRAINT "FK_48294f38620aff71b127b786e9b" FOREIGN KEY ("news_id") REFERENCES "news"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "news_authors" ADD CONSTRAINT "FK_68b0634801fad56c09e7c7b8b29" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "news_tags" ADD CONSTRAINT "FK_afe9599f04a11fd263c28db5564" FOREIGN KEY ("news_id") REFERENCES "news"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "news_tags" ADD CONSTRAINT "FK_e98737624b91ccba0ce32684676" FOREIGN KEY ("tag_id") REFERENCES "tags"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "news_tags" DROP CONSTRAINT "FK_e98737624b91ccba0ce32684676"`,
    );
    await queryRunner.query(
      `ALTER TABLE "news_tags" DROP CONSTRAINT "FK_afe9599f04a11fd263c28db5564"`,
    );
    await queryRunner.query(
      `ALTER TABLE "news_authors" DROP CONSTRAINT "FK_68b0634801fad56c09e7c7b8b29"`,
    );
    await queryRunner.query(
      `ALTER TABLE "news_authors" DROP CONSTRAINT "FK_48294f38620aff71b127b786e9b"`,
    );
    await queryRunner.query(
      `ALTER TABLE "news" DROP CONSTRAINT "FK_53587e49282ab1b2d11f40ea23f"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_e98737624b91ccba0ce3268467"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_afe9599f04a11fd263c28db556"`,
    );
    await queryRunner.query(`DROP TABLE "news_tags"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_68b0634801fad56c09e7c7b8b2"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_48294f38620aff71b127b786e9"`,
    );
    await queryRunner.query(`DROP TABLE "news_authors"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_53587e49282ab1b2d11f40ea23"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_030a7be1878b413ab7dfaccf30"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_577312b7a63c52d081bb4f24c6"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_d09152c44881b7620e12d6df09"`,
    );
    await queryRunner.query(`DROP TABLE "news"`);
  }
}
