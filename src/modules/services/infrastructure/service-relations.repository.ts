import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { isEmptyPatch } from '../../../core/persistence/is-empty-patch.util';
import { ServiceRelation } from '../domain/service-relation.entity';

interface CreateServiceRelationRecord {
  serviceId: number;
  relatedServiceId: number;
  order: number;
}

type UpdateServiceRelationRecord = Partial<CreateServiceRelationRecord>;

@Injectable()
export class ServiceRelationsRepository {
  constructor(
    @InjectRepository(ServiceRelation)
    private readonly repo: Repository<ServiceRelation>,
  ) {}

  findAndCount(
    page: number,
    limit: number,
  ): Promise<[ServiceRelation[], number]> {
    return this.repo.findAndCount({
      order: { id: 'ASC' },
      skip: (page - 1) * limit,
      take: limit,
    });
  }

  findById(id: number): Promise<ServiceRelation | null> {
    return this.repo.findOne({ where: { id } });
  }

  create(data: CreateServiceRelationRecord): Promise<ServiceRelation> {
    return this.repo.save(this.repo.create(data));
  }

  async update(
    id: number,
    patch: UpdateServiceRelationRecord,
  ): Promise<ServiceRelation | null> {
    if (!isEmptyPatch(patch)) {
      await this.repo.update(id, patch);
    }
    return this.findById(id);
  }

  async remove(id: number): Promise<void> {
    await this.repo.delete(id);
  }
}
