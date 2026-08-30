import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMediaCoverAndDimensions1788083082337 implements MigrationInterface {
  name = 'AddMediaCoverAndDimensions1788083082337';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "media" ADD "width" integer`);
    await queryRunner.query(`ALTER TABLE "media" ADD "height" integer`);
    await queryRunner.query(
      `ALTER TABLE "media" ADD "mime_type" character varying(100)`,
    );
    await queryRunner.query(`ALTER TABLE "media" ADD "size_bytes" integer`);
    await queryRunner.query(`ALTER TABLE "cases" ADD "cover_media_id" integer`);
    await queryRunner.query(
      `ALTER TABLE "articles" ADD "cover_media_id" integer`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_3547d4b2081a9327893cbafd62" ON "cases"  ("cover_media_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_a74d78d839af9974f904174720" ON "articles"  ("cover_media_id") `,
    );
    await queryRunner.query(
      `ALTER TABLE "cases" ADD CONSTRAINT "FK_3547d4b2081a9327893cbafd62e" FOREIGN KEY ("cover_media_id") REFERENCES "media"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "articles" ADD CONSTRAINT "FK_a74d78d839af9974f9041747204" FOREIGN KEY ("cover_media_id") REFERENCES "media"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "articles" DROP CONSTRAINT "FK_a74d78d839af9974f9041747204"`,
    );
    await queryRunner.query(
      `ALTER TABLE "cases" DROP CONSTRAINT "FK_3547d4b2081a9327893cbafd62e"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_a74d78d839af9974f904174720"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_3547d4b2081a9327893cbafd62"`,
    );
    await queryRunner.query(
      `ALTER TABLE "articles" DROP COLUMN "cover_media_id"`,
    );
    await queryRunner.query(`ALTER TABLE "cases" DROP COLUMN "cover_media_id"`);
    await queryRunner.query(`ALTER TABLE "media" DROP COLUMN "size_bytes"`);
    await queryRunner.query(`ALTER TABLE "media" DROP COLUMN "mime_type"`);
    await queryRunner.query(`ALTER TABLE "media" DROP COLUMN "height"`);
    await queryRunner.query(`ALTER TABLE "media" DROP COLUMN "width"`);
  }
}
