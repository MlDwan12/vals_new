import { MigrationInterface, QueryRunner } from 'typeorm';

// security-audit-2026-08-31.md, MEDIUM №4 — service_to_case.service_id был ON DELETE CASCADE,
// удаление услуги молча обнуляло Case.services у ссылающихся кейсов в обход ArrayMinSize(1) на
// DTO (case_id остаётся CASCADE — удаление кейса по-прежнему должно чистить связь без вопросов,
// меняется только направление "услуга → кейс").
export class RestrictServiceToCaseServiceDelete1788345797591 implements MigrationInterface {
  name = 'RestrictServiceToCaseServiceDelete1788345797591';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "service_to_case" DROP CONSTRAINT "FK_5fc3d4fedba1f520f7af8f7fc7f"`,
    );
    await queryRunner.query(
      `ALTER TABLE "service_to_case" ADD CONSTRAINT "FK_5fc3d4fedba1f520f7af8f7fc7f" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "service_to_case" DROP CONSTRAINT "FK_5fc3d4fedba1f520f7af8f7fc7f"`,
    );
    await queryRunner.query(
      `ALTER TABLE "service_to_case" ADD CONSTRAINT "FK_5fc3d4fedba1f520f7af8f7fc7f" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }
}
