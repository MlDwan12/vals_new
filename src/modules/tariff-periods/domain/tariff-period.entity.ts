import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

// Самостоятельный справочник периодов оплаты — не связан FK с tariffs
// (billingCycles тарифа ссылается на months по значению, не по id).
@Entity('tariff_periods')
export class TariffPeriod {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  months: number;

  @Column({ name: 'discount_percent', type: 'int', nullable: true })
  discountPercent: number | null;
}
