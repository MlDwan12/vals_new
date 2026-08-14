import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ServiceFaq } from '../domain/service-faq.entity';

interface CreateServiceFaqRecord {
  serviceId: number;
  question: string;
  answer: string;
}

type UpdateServiceFaqRecord = Partial<CreateServiceFaqRecord>;

@Injectable()
export class ServiceFaqRepository {
  constructor(
    @InjectRepository(ServiceFaq)
    private readonly repo: Repository<ServiceFaq>,
  ) {}

  findAndCount(page: number, limit: number): Promise<[ServiceFaq[], number]> {
    return this.repo.findAndCount({
      order: { id: 'ASC' },
      skip: (page - 1) * limit,
      take: limit,
    });
  }

  findById(id: number): Promise<ServiceFaq | null> {
    return this.repo.findOne({ where: { id } });
  }

  create(data: CreateServiceFaqRecord): Promise<ServiceFaq> {
    return this.repo.save(this.repo.create(data));
  }

  async update(
    id: number,
    patch: UpdateServiceFaqRecord,
  ): Promise<ServiceFaq | null> {
    await this.repo.update(id, patch);
    return this.findById(id);
  }

  async remove(id: number): Promise<void> {
    await this.repo.delete(id);
  }
}
