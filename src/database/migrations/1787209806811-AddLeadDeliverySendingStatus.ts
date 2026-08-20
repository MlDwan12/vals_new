import { MigrationInterface, QueryRunner } from 'typeorm';

// Промежуточный статус для claim-апдейта доставки лидов (H10 code review): без него ручной retry
// и планировщик читают status в память и решают отправлять ли не атомарно — двойной клик или
// гонка с параллельным инстансом даёт дубль лида в Bitrix CRM.
export class AddLeadDeliverySendingStatus1787209806811 implements MigrationInterface {
  name = 'AddLeadDeliverySendingStatus1787209806811';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "public"."client_leads_status_enum" ADD VALUE 'sending'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Postgres не даёт удалить значение enum напрямую — пересоздаём тип без 'sending'. На случай
    // отката во время активной доставки сначала возвращаем такие строки в 'pending', чтобы
    // планировщик подобрал их заново, а не потерял.
    await queryRunner.query(
      `UPDATE "client_leads" SET "status" = 'pending' WHERE "status" = 'sending'`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."client_leads_status_enum" RENAME TO "client_leads_status_enum_old"`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."client_leads_status_enum" AS ENUM('pending', 'sent', 'failed')`,
    );
    await queryRunner.query(
      `ALTER TABLE "client_leads" ALTER COLUMN "status" DROP DEFAULT`,
    );
    await queryRunner.query(
      `ALTER TABLE "client_leads" ALTER COLUMN "status" TYPE "public"."client_leads_status_enum" USING "status"::text::"public"."client_leads_status_enum"`,
    );
    await queryRunner.query(
      `ALTER TABLE "client_leads" ALTER COLUMN "status" SET DEFAULT 'pending'`,
    );
    await queryRunner.query(
      `DROP TYPE "public"."client_leads_status_enum_old"`,
    );
  }
}
