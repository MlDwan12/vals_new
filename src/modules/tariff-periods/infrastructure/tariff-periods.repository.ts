import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
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
  ) {}

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
    await this.repo.update(id, patch);
    return this.findById(id);
  }

  async remove(id: number): Promise<void> {
    await this.repo.delete(id);
  }
}
