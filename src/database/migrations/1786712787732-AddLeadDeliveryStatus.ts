import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddLeadDeliveryStatus1786712787732 implements MigrationInterface {
  name = 'AddLeadDeliveryStatus1786712787732';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."client_leads_status_enum" AS ENUM('pending', 'sent', 'failed')`,
    );
    await queryRunner.query(
      `ALTER TABLE "client_leads" ADD "status" "public"."client_leads_status_enum" NOT NULL DEFAULT 'pending'`,
    );
    await queryRunner.query(
      `ALTER TABLE "client_leads" ADD "retry_count" integer NOT NULL DEFAULT '0'`,
    );
    await queryRunner.query(
      `ALTER TABLE "client_leads" ADD "next_retry_at" TIMESTAMP WITH TIME ZONE`,
    );
    await queryRunner.query(
      `ALTER TABLE "client_leads" ADD "bitrix_error" text`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_33399cc26b39898b03c6716991" ON "client_leads"  ("status") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_4f22ad8b78a62fd015031742eb" ON "client_leads"  ("next_retry_at") `,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."IDX_4f22ad8b78a62fd015031742eb"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_33399cc26b39898b03c6716991"`,
    );
    await queryRunner.query(
      `ALTER TABLE "client_leads" DROP COLUMN "bitrix_error"`,
    );
    await queryRunner.query(
      `ALTER TABLE "client_leads" DROP COLUMN "next_retry_at"`,
    );
    await queryRunner.query(
      `ALTER TABLE "client_leads" DROP COLUMN "retry_count"`,
    );
    await queryRunner.query(`ALTER TABLE "client_leads" DROP COLUMN "status"`);
    await queryRunner.query(`DROP TYPE "public"."client_leads_status_enum"`);
  }
}
