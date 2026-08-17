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

  // Для reindex поиска — вопрос/ответ + slug родительской услуги (услуги всегда опубликованы,
  // гейта по датам нет).
  findAllForSearchIndex(): Promise<
    { id: number; question: string; answer: string; serviceSlug: string }[]
  > {
    return this.repo
      .createQueryBuilder('faq')
      .innerJoin('faq.service', 'service')
      .select('faq.id', 'id')
      .addSelect('faq.question', 'question')
      .addSelect('faq.answer', 'answer')
      .addSelect('service.slug', 'serviceSlug')
      .getRawMany();
  }

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
