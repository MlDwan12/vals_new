import { Injectable, NotFoundException } from '@nestjs/common';
import {
  buildPaginatedResult,
  PaginatedResult,
} from '../../../core/pagination/paginated-result.interface';
import { ClientListQueryDto } from '../dto/client-list-query.dto';
import { ClientResponseDto } from '../dto/client-response.dto';
import { ClientsRepository } from '../infrastructure/clients.repository';

@Injectable()
export class ClientsAdminService {
  constructor(private readonly clientsRepository: ClientsRepository) {}

  async findAndCount(
    query: ClientListQueryDto,
  ): Promise<PaginatedResult<ClientResponseDto>> {
    const [items, total] = await this.clientsRepository.findAndCount(
      query.page,
      query.limit,
      query.search,
    );
    return buildPaginatedResult(
      items.map((client) => ClientResponseDto.fromEntity(client)),
      total,
      query.page,
      query.limit,
    );
  }

  async findById(id: number): Promise<ClientResponseDto> {
    const client = await this.clientsRepository.findById(id);
    if (!client) {
      throw new NotFoundException(`Клиент с ID ${id} не найден`);
    }
    return ClientResponseDto.fromEntity(client);
  }

  async remove(id: number): Promise<void> {
    const client = await this.clientsRepository.findById(id);
    if (!client) {
      throw new NotFoundException(`Клиент с ID ${id} не найден`);
    }
    await this.clientsRepository.remove(id);
  }
}
