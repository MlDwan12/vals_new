import { MigrationInterface, QueryRunner } from "typeorm";

export class FixAuthorsCascadeDelete1786624065330 implements MigrationInterface {
    name = 'FixAuthorsCascadeDelete1786624065330'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "case_authors" DROP CONSTRAINT "FK_ef26fbd45d4829ee93fc2f55de6"`);
        await queryRunner.query(`ALTER TABLE "article_authors" DROP CONSTRAINT "FK_a045495388d3a462887cc91cfca"`);
        await queryRunner.query(`ALTER TABLE "case_authors" ADD CONSTRAINT "FK_ef26fbd45d4829ee93fc2f55de6" FOREIGN KEY ("case_id") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE "article_authors" ADD CONSTRAINT "FK_a045495388d3a462887cc91cfca" FOREIGN KEY ("article_id") REFERENCES "articles"("id") ON DELETE CASCADE ON UPDATE CASCADE`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "article_authors" DROP CONSTRAINT "FK_a045495388d3a462887cc91cfca"`);
        await queryRunner.query(`ALTER TABLE "case_authors" DROP CONSTRAINT "FK_ef26fbd45d4829ee93fc2f55de6"`);
        await queryRunner.query(`ALTER TABLE "article_authors" ADD CONSTRAINT "FK_a045495388d3a462887cc91cfca" FOREIGN KEY ("article_id") REFERENCES "articles"("id") ON DELETE RESTRICT ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE "case_authors" ADD CONSTRAINT "FK_ef26fbd45d4829ee93fc2f55de6" FOREIGN KEY ("case_id") REFERENCES "cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE`);
    }

}
