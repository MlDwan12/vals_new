import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Service } from '../domain/service.entity';

@Injectable()
export class ServicesRepository {
  constructor(
    @InjectRepository(Service) private readonly repo: Repository<Service>,
  ) {}

  findByIds(ids: number[]): Promise<Service[]> {
    if (!ids.length) return Promise.resolve([]);
    return this.repo.find({
      where: { id: In(ids) },
      select: { id: true, slug: true, title: true },
    });
  }

  findBySlug(slug: string): Promise<Service | null> {
    return this.repo.findOne({
      where: { slug },
      select: { id: true, slug: true, title: true },
    });
  }
}
