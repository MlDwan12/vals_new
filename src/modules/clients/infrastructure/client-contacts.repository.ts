import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ClientContact } from '../domain/client-contact.entity';

@Injectable()
export class ClientContactsRepository {
  constructor(
    @InjectRepository(ClientContact)
    private readonly repo: Repository<ClientContact>,
  ) {}

  findById(id: number): Promise<ClientContact | null> {
    return this.repo.findOne({ where: { id } });
  }

  findAndCount(
    page: number,
    limit: number,
  ): Promise<[ClientContact[], number]> {
    return this.repo.findAndCount({
      order: { id: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
  }

  findByClientId(clientId: number): Promise<ClientContact[]> {
    return this.repo.find({ where: { clientId }, order: { id: 'ASC' } });
  }
}
