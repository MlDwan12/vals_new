import { MigrationInterface, QueryRunner } from 'typeorm';

// EXPANSION_TASKS.md, задача 2 (журнал действий администраторов), §2.2/§2.3/§2.5 —
// санитайзированное тело запроса (`meta`) для экрана "что именно изменили" и `signed` (был ли
// @Audit на ручке или сработало автоправило по пути/методу — отдельная колонка, не флаг внутри
// meta), плюс индексы под фильтры этого экрана: составной (user_id, created_at) вместо
// одиночного user_id (leftmost prefix покрывает и его), отдельные resource и status_code.
export class AddAuditLogMeta1787911848451 implements MigrationInterface {
  name = 'AddAuditLogMeta1787911848451';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."IDX_bd2726fd31b35443f2245b93ba"`,
    );
    await queryRunner.query(`ALTER TABLE "audit_logs" ADD "meta" jsonb`);
    await queryRunner.query(
      `ALTER TABLE "audit_logs" ADD "signed" boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_8769d5d852a6b56dd77186a1c6" ON "audit_logs"  ("resource") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_df06717c685a2a639ce47bce76" ON "audit_logs"  ("status_code") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_2f68e345c05e8166ff9deea1ab" ON "audit_logs"  ("user_id", "created_at") `,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."IDX_2f68e345c05e8166ff9deea1ab"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_df06717c685a2a639ce47bce76"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_8769d5d852a6b56dd77186a1c6"`,
    );
    await queryRunner.query(`ALTER TABLE "audit_logs" DROP COLUMN "signed"`);
    await queryRunner.query(`ALTER TABLE "audit_logs" DROP COLUMN "meta"`);
    await queryRunner.query(
      `CREATE INDEX "IDX_bd2726fd31b35443f2245b93ba" ON "audit_logs" USING btree ("user_id") `,
    );
  }
}
