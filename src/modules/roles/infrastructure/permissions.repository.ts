import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Permission } from '../domain/permission.entity';

@Injectable()
export class PermissionsRepository {
  constructor(
    @InjectRepository(Permission)
    private readonly repo: Repository<Permission>,
  ) {}

  // Заводится только сидом-миграцией (EXPANSION_TASKS.md §1.2) — здесь только чтение, для списка
  // чекбоксов в панели (findAll) и резолва по id при сборке/правке роли (findByIds).
  findAll(): Promise<Permission[]> {
    return this.repo.find({ order: { group: 'ASC', code: 'ASC' } });
  }

  findByIds(ids: number[]): Promise<Permission[]> {
    if (!ids.length) return Promise.resolve([]);
    return this.repo.find({ where: { id: In(ids) } });
  }
}
