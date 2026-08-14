import { MigrationInterface, QueryRunner } from 'typeorm';

// Объединение media/image-lib в одну подсистему (ТЗ §2, этап 4) — image_lib больше не отдельная
// таблица, её функциональность полностью покрывает media. TypeORM migration:generate не видит эту
// таблицу (она больше не привязана ни к одной entity), поэтому миграция написана руками — DDL
// зеркалит исходное определение из InitialSchema (1786618525342), down() восстанавливает его один в один.
export class DropImageLib1786708453566 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "image_lib"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "image_lib" ("id" SERIAL NOT NULL, "link" character varying(2048) NOT NULL, "name" character varying(255) NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_e0ea731e20a89c13718dcc745d9" UNIQUE ("link"), CONSTRAINT "UQ_72c5a803d83822e5c2dc0ff7b35" UNIQUE ("name"), CONSTRAINT "PK_18de5103abd5cde058122b0a123" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_e0ea731e20a89c13718dcc745d" ON "image_lib"  ("link") `,
    );
  }
}
