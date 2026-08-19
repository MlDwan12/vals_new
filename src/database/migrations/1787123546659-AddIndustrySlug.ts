import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddIndustrySlug1787123546659 implements MigrationInterface {
  name = 'AddIndustrySlug1787123546659';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "industries" ADD "slug" character varying(255)`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_4ff129e4d52b3a32e131fa21fd" ON "industries" ("slug")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."IDX_4ff129e4d52b3a32e131fa21fd"`,
    );
    await queryRunner.query(`ALTER TABLE "industries" DROP COLUMN "slug"`);
  }
}
