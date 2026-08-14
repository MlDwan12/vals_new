import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ServiceCategory } from '../domain/service-category.entity';

interface CreateServiceCategoryRecord {
  name: string;
  description?: string;
}

type UpdateServiceCategoryRecord = Partial<CreateServiceCategoryRecord>;

@Injectable()
export class ServiceCategoriesRepository {
  constructor(
    @InjectRepository(ServiceCategory)
    private readonly repo: Repository<ServiceCategory>,
  ) {}

  findAll(): Promise<ServiceCategory[]> {
    return this.repo.find({ order: { id: 'ASC' } });
  }

  findAndCount(
    page: number,
    limit: number,
  ): Promise<[ServiceCategory[], number]> {
    return this.repo.findAndCount({
      order: { id: 'ASC' },
      skip: (page - 1) * limit,
      take: limit,
    });
  }

  findById(id: number): Promise<ServiceCategory | null> {
    return this.repo.findOne({ where: { id } });
  }

  create(data: CreateServiceCategoryRecord): Promise<ServiceCategory> {
    return this.repo.save(this.repo.create(data));
  }

  async update(
    id: number,
    patch: UpdateServiceCategoryRecord,
  ): Promise<ServiceCategory | null> {
    await this.repo.update(id, patch);
    return this.findById(id);
  }

  async remove(id: number): Promise<void> {
    await this.repo.delete(id);
  }
}
