import { MigrationInterface, QueryRunner } from 'typeorm';

// Верхняя граница числа реклеймов зависшего SENDING (N-2, round-3 review): без счётчика реклейм по
// таймауту (sending_at) безусловен, а sending_at обновляется на каждом реклейме — то есть возраст
// самого первого зависания теряется, и отличить "процесс упал между claim и записью" от
// "детерминированный сбой записи, реклейм не поможет" нечем. Счётчик даёт то, чего не даёт время:
// прямую границу на число повторных POST в Bitrix для одной заявки.
export class AddClientLeadSendingReclaimCount1787230000000 implements MigrationInterface {
  name = 'AddClientLeadSendingReclaimCount1787230000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "client_leads" ADD "sending_reclaim_count" integer NOT NULL DEFAULT 0`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "client_leads" DROP COLUMN "sending_reclaim_count"`,
    );
  }
}
