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
}
