import { BadRequestException, Injectable } from '@nestjs/common';
import { TariffPeriodsRepository } from '../../tariff-periods/infrastructure/tariff-periods.repository';
import { TariffsRepository } from '../../tariffs/infrastructure/tariffs.repository';
import { TariffSnapshot } from './tariff-snapshot.interface';

// Снапшот тарифа на момент заявки (не FK на живой тариф) — цена/название сохраняются в заявке такими,
// какими были при отправке, даже если тариф потом изменится или удалится. Заменяет regex-парсинг
// serviceName/tariffName/цены из Bitrix-комментария, который был в старом admin/client-leads.
@Injectable()
export class TariffSnapshotResolverService {
  constructor(
    private readonly tariffsRepository: TariffsRepository,
    private readonly tariffPeriodsRepository: TariffPeriodsRepository,
  ) {}

  async resolve(tariffId: number, periodId: number): Promise<TariffSnapshot> {
    const tariff = await this.tariffsRepository.findByIdWithService(tariffId);
    if (!tariff) {
      throw new BadRequestException(`Тариф с ID ${tariffId} не найден`);
    }

    const period = await this.tariffPeriodsRepository.findById(periodId);
    if (!period) {
      throw new BadRequestException(`Период с ID ${periodId} не найден`);
    }

    const cycle = tariff.billingCycles.find(
      (item) => item.periodId === period.id,
    );
    if (!cycle) {
      throw new BadRequestException(
        'Расчётный период не найден для этого тарифа',
      );
    }
    if (cycle.pricePerMonth === null) {
      throw new BadRequestException(
        'Цена за месяц не настроена для этого периода',
      );
    }

    return {
      serviceName: tariff.service?.title ?? '—',
      tariffName: tariff.name,
      periodMonths: period.months,
      pricePerMonth: cycle.pricePerMonth,
      totalPrice: cycle.totalPrice,
    };
  }
}
