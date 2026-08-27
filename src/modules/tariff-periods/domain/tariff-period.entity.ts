import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

// Самостоятельный справочник периодов оплаты — без FK на tariffs: Tariff.billingCycles (jsonb)
// хранит periodId как значение, резолвится через findByIds при пересборке цикла, а не живая связь
// на уровне БД. TariffPeriodsRepository.remove() поэтому не защищён FK-констрейнтом — проверку
// "используется ли период" делает TariffsRepository.existsByPeriodId, вызывается из
// TariffPeriodsService.remove() (Б5, независимый аудит 2026-08-21, комментарий здесь раньше
// ошибочно называл это ссылкой "по месяцам").
@Entity('tariff_periods')
export class TariffPeriod {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  months: number;

  @Column({ name: 'discount_percent', type: 'int', nullable: true })
  discountPercent: number | null;
}
