import { MigrationInterface, QueryRunner } from 'typeorm';

// В старом vals_api уникальным был только slug, name — обычная колонка. Уникальность на name
// вводится здесь впервые: TagsService.create() идемпотентен по имени (creatable-комбобокс не
// должен плодить дубли), но без constraint'а в БД это только check-then-act в приложении —
// конкурентный двойной сабмит с одним и тем же именем всё равно создаёт два тега (code review).
export class AddTagNameUnique1787209807011 implements MigrationInterface {
  name = 'AddTagNameUnique1787209807011';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_tags_name_unique" ON "tags" ("name")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IDX_tags_name_unique"`);
  }
}
