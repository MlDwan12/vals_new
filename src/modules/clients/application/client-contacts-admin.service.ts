import { Injectable, NotFoundException } from '@nestjs/common';
import {
  buildPaginatedResult,
  PaginatedResult,
} from '../../../core/pagination/paginated-result.interface';
import { PaginationQueryDto } from '../../../core/dto/pagination-query.dto';
import { ClientContactResponseDto } from '../dto/client-contact-response.dto';
import { ClientContactsRepository } from '../infrastructure/client-contacts.repository';

@Injectable()
export class ClientContactsAdminService {
  constructor(
    private readonly clientContactsRepository: ClientContactsRepository,
  ) {}

  async findAndCount(
    query: PaginationQueryDto,
  ): Promise<PaginatedResult<ClientContactResponseDto>> {
    const [items, total] = await this.clientContactsRepository.findAndCount(
      query.page,
      query.limit,
    );
    return buildPaginatedResult(
      items.map((contact) => ClientContactResponseDto.fromEntity(contact)),
      total,
      query.page,
      query.limit,
    );
  }

  async findById(id: number): Promise<ClientContactResponseDto> {
    const contact = await this.clientContactsRepository.findById(id);
    if (!contact) {
      throw new NotFoundException(`Контакт с ID ${id} не найден`);
    }
    return ClientContactResponseDto.fromEntity(contact);
  }

  async findByClientId(clientId: number): Promise<ClientContactResponseDto[]> {
    const contacts =
      await this.clientContactsRepository.findByClientId(clientId);
    return contacts.map((contact) =>
      ClientContactResponseDto.fromEntity(contact),
    );
  }
}
