import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Tariff } from '../domain/tariff.entity';

@Injectable()
export class TariffsRepository {
  constructor(
    @InjectRepository(Tariff) private readonly repo: Repository<Tariff>,
  ) {}

  findAndCount(page: number, limit: number): Promise<[Tariff[], number]> {
    return this.repo.findAndCount({
      order: { id: 'ASC' },
      skip: (page - 1) * limit,
      take: limit,
    });
  }

  findById(id: number): Promise<Tariff | null> {
    return this.repo.findOne({ where: { id } });
  }

  // Резолв тарифа для приёма заявок (TARIFF_REQUEST) — нужен service.title для текста заявки.
  findByIdWithService(id: number): Promise<Tariff | null> {
    return this.repo.findOne({ where: { id }, relations: { service: true } });
  }

  create(data: {
    service: Tariff['service'];
    name: string;
    from: string;
    features: string;
    isPopular: boolean;
    billingCycles: Tariff['billingCycles'];
    basePrice: number;
    orderIndex: number;
  }): Tariff {
    return this.repo.create(data);
  }

  save(tariff: Tariff): Promise<Tariff> {
    return this.repo.save(tariff);
  }

  async remove(id: number): Promise<void> {
    await this.repo.delete(id);
  }

  // billing_cycles — jsonb-снапшот, не FK на tariff_periods (комментарий в tariff-period.entity.ts
  // раньше ошибочно называл это ссылкой "по месяцам", а не по id — periodId там реально хранится) —
  // без этой проверки TariffPeriodsService.remove() удалял бы используемый период молча (Б5,
  // независимый аудит 2026-08-21), а следующий пересчёт billingCycles тарифа падал бы непонятной
  // 400 "Периоды тарифа не найдены".
  existsByPeriodId(periodId: number): Promise<boolean> {
    return this.repo
      .createQueryBuilder('tariff')
      .where(
        `EXISTS (
          SELECT 1 FROM jsonb_array_elements(tariff.billing_cycles) AS cycle
          WHERE (cycle->>'periodId')::int = :periodId
        )`,
        { periodId },
      )
      .getExists();
  }
}
