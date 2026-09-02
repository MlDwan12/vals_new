import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { isEmptyPatch } from '../../../core/persistence/is-empty-patch.util';
import { withTariffPeriodMutationLock } from '../../../core/persistence/tariff-period-mutation-lock.util';
import { TariffPeriod } from '../domain/tariff-period.entity';

interface CreateTariffPeriodRecord {
  months: number;
  discountPercent?: number;
}

type UpdateTariffPeriodRecord = Partial<CreateTariffPeriodRecord>;

@Injectable()
export class TariffPeriodsRepository {
  constructor(
    @InjectRepository(TariffPeriod)
    private readonly repo: Repository<TariffPeriod>,
    private readonly dataSource: DataSource,
  ) {}

  // Сериализует удаление периода (TariffPeriodsService.remove) и создание/обновление тарифа с
  // periodIds (TariffsService) между собой (security-audit-2026-08-31.md MEDIUM №5) — иначе
  // check-then-act по обе стороны видит устаревшее состояние друг друга: период, удалённый только
  // что, но ещё «не используется» с точки зрения уже начатого сохранения тарифа. DataSource — не
  // TariffsRepository напрямую (не создаёт цикл провайдеров поверх уже существующего цикла модулей
  // TariffsModule/TariffPeriodsModule, см. комментарий в tariffs.module.ts) — вызывающий сервис сам
  // передаёт колбэком, какие из уже инжектированных ему репозиториев вызвать под локом.
  withMutationLock<T>(fn: () => Promise<T>): Promise<T> {
    return withTariffPeriodMutationLock(this.dataSource, fn);
  }

  findAll(): Promise<TariffPeriod[]> {
    return this.repo.find({ order: { id: 'ASC' } });
  }

  findAndCount(page: number, limit: number): Promise<[TariffPeriod[], number]> {
    return this.repo.findAndCount({
      order: { id: 'ASC' },
      skip: (page - 1) * limit,
      take: limit,
    });
  }

  findById(id: number): Promise<TariffPeriod | null> {
    return this.repo.findOne({ where: { id } });
  }

  findByIds(ids: number[]): Promise<TariffPeriod[]> {
    if (!ids.length) return Promise.resolve([]);
    return this.repo.find({ where: { id: In(ids) } });
  }

  create(data: CreateTariffPeriodRecord): Promise<TariffPeriod> {
    return this.repo.save(this.repo.create(data));
  }

  async update(
    id: number,
    patch: UpdateTariffPeriodRecord,
  ): Promise<TariffPeriod | null> {
    if (!isEmptyPatch(patch)) {
      await this.repo.update(id, patch);
    }
    return this.findById(id);
  }

  async remove(id: number): Promise<void> {
    await this.repo.delete(id);
  }
}
