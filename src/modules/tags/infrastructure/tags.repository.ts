import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Tag } from '../domain/tag.entity';

@Injectable()
export class TagsRepository {
  constructor(@InjectRepository(Tag) private readonly repo: Repository<Tag>) {}

  findByIds(ids: number[]): Promise<Tag[]> {
    if (!ids.length) return Promise.resolve([]);
    return this.repo.find({ where: { id: In(ids) }, select: { id: true } });
  }
}
