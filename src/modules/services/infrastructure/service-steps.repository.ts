import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ServiceStep } from '../domain/service-step.entity';

interface CreateServiceStepRecord {
  step: number;
  title: string;
  description: string;
  time?: string;
  serviceId: number;
}

type UpdateServiceStepRecord = Partial<CreateServiceStepRecord>;

@Injectable()
export class ServiceStepsRepository {
  constructor(
    @InjectRepository(ServiceStep)
    private readonly repo: Repository<ServiceStep>,
  ) {}

  findAndCount(page: number, limit: number): Promise<[ServiceStep[], number]> {
    return this.repo.findAndCount({
      order: { id: 'ASC' },
      skip: (page - 1) * limit,
      take: limit,
    });
  }

  findById(id: number): Promise<ServiceStep | null> {
    return this.repo.findOne({ where: { id } });
  }

  create(data: CreateServiceStepRecord): Promise<ServiceStep> {
    return this.repo.save(this.repo.create(data));
  }

  async update(
    id: number,
    patch: UpdateServiceStepRecord,
  ): Promise<ServiceStep | null> {
    await this.repo.update(id, patch);
    return this.findById(id);
  }

  async remove(id: number): Promise<void> {
    await this.repo.delete(id);
  }
}
