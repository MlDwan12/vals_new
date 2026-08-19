import { MigrationInterface, QueryRunner } from 'typeorm';

// Реклейм зависшей доставки (altitude review на H10-фикс, AddLeadDeliverySendingStatus): без
// отметки момента claim-а зависший процесс (крэш/kill между claim и markSent/markFailedAttempt)
// навсегда оставляет заявку в статусе SENDING — её никто больше не подбирает.
export class AddClientLeadSendingAt1787200000100 implements MigrationInterface {
  name = 'AddClientLeadSendingAt1787200000100';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "client_leads" ADD "sending_at" TIMESTAMP WITH TIME ZONE`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "client_leads" DROP COLUMN "sending_at"`,
    );
  }
}
