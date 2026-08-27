import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, Repository } from 'typeorm';
import { escapeLikePattern } from '../../../core/persistence/escape-like-pattern.util';
import { Client } from '../domain/client.entity';

@Injectable()
export class ClientsRepository {
  constructor(
    @InjectRepository(Client) private readonly repo: Repository<Client>,
  ) {}

  findById(id: number): Promise<Client | null> {
    return this.repo.findOne({ where: { id } });
  }

  // isMerged: false — тот же фильтр, что и в findAndCount() ниже: слитые дубли не должны считаться
  // отдельными клиентами (Б7, независимый аудит 2026-08-21 — дашборд без этого фильтра завышал
  // счётчик клиентов относительно того, что реально видно в /admin/clients).
  count(): Promise<number> {
    return this.repo.count({ where: { isMerged: false } });
  }

  // Совпадает со старым контрактом: поиск по primaryPhone/primaryEmail, слитые дубли из списка не
  // видны (isMerged: false) — как и в старом admin/client.
  findAndCount(
    page: number,
    limit: number,
    search?: string,
  ): Promise<[Client[], number]> {
    const pattern = search ? `%${escapeLikePattern(search)}%` : null;

    return this.repo.findAndCount({
      where: pattern
        ? [
            { isMerged: false, primaryPhone: ILike(pattern) },
            { isMerged: false, primaryEmail: ILike(pattern) },
          ]
        : { isMerged: false },
      select: {
        id: true,
        name: true,
        primaryPhone: true,
        primaryEmail: true,
        leadsCount: true,
        lastLeadAt: true,
        createdAt: true,
      },
      order: { id: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
  }

  async remove(id: number): Promise<void> {
    await this.repo.delete(id);
  }
}
