import { MigrationInterface, QueryRunner } from 'typeorm';

// Старый vals_api держал уникальный индекс на tags.name (не только slug) — при переносе схемы в
// этап 1 колонка перенесена как обычная, без уникальности. TagsService.create() идемпотентен по
// имени (creatable-комбобокс не должен плодить дубли), но без constraint'а в БД это только
// check-then-act в приложении — конкурентный двойной сабмит с одним и тем же именем всё равно
// создаёт два тега (code review).
export class AddTagNameUnique1787200000200 implements MigrationInterface {
  name = 'AddTagNameUnique1787200000200';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_tags_name_unique" ON "tags" ("name")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IDX_tags_name_unique"`);
  }
}
