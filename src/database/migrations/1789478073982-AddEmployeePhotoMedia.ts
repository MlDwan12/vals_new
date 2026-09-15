import { MigrationInterface, QueryRunner } from 'typeorm';

// Фото сотрудника: строка photo_url → ссылка на медиатеку photo_media_id (по образцу обложек).
// На момент перехода photo_url пуст у всех, но если кто-то успел вставить ссылку на файл из
// медиатеки, она переносится по имени файла, а не теряется. Ссылки на чужие домены пропадают:
// медиатека хранит только свои файлы.
export class AddEmployeePhotoMedia1789478073982 implements MigrationInterface {
  name = 'AddEmployeePhotoMedia1789478073982';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "employees" ADD "photo_media_id" integer`,
    );
    await queryRunner.query(
      `UPDATE "employees" e SET "photo_media_id" = m."id"
       FROM "media" m
       WHERE e."photo_url" IS NOT NULL
         AND e."photo_url" LIKE '%/' || m."file_name"`,
    );
    await queryRunner.query(`ALTER TABLE "employees" DROP COLUMN "photo_url"`);
    await queryRunner.query(
      `CREATE INDEX "IDX_8aa7162e6224599fde167b1f0e" ON "employees"  ("photo_media_id") `,
    );
    await queryRunner.query(
      `ALTER TABLE "employees" ADD CONSTRAINT "FK_8aa7162e6224599fde167b1f0e5" FOREIGN KEY ("photo_media_id") REFERENCES "media"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "employees" DROP CONSTRAINT "FK_8aa7162e6224599fde167b1f0e5"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_8aa7162e6224599fde167b1f0e"`,
    );
    await queryRunner.query(
      `ALTER TABLE "employees" ADD "photo_url" character varying(2048)`,
    );
    await queryRunner.query(
      `UPDATE "employees" e SET "photo_url" = '/uploads/media/' || m."file_name"
       FROM "media" m
       WHERE e."photo_media_id" = m."id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "employees" DROP COLUMN "photo_media_id"`,
    );
  }
}
