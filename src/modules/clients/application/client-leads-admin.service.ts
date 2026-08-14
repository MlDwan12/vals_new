import { Injectable, NotFoundException } from '@nestjs/common';
import {
  buildPaginatedResult,
  PaginatedResult,
} from '../../../core/pagination/paginated-result.interface';
import { ClientLeadListQueryDto } from '../dto/client-lead-list-query.dto';
import { ClientLeadResponseDto } from '../dto/client-lead-response.dto';
import { LeadDeliveryStatus } from '../enums/lead-delivery-status.enum';
import { ClientLeadsRepository } from '../infrastructure/client-leads.repository';
import { LeadDeliveryService } from './lead-delivery.service';

@Injectable()
export class ClientLeadsAdminService {
  constructor(
    private readonly clientLeadsRepository: ClientLeadsRepository,
    private readonly leadDeliveryService: LeadDeliveryService,
  ) {}

  async findAndCount(
    query: ClientLeadListQueryDto,
  ): Promise<PaginatedResult<ClientLeadResponseDto>> {
    const [items, total] = await this.clientLeadsRepository.findAndCount({
      clientId: query.clientId,
      type: query.type,
      page: query.page,
      limit: query.limit,
    });
    return buildPaginatedResult(
      items.map((lead) => ClientLeadResponseDto.fromEntity(lead)),
      total,
      query.page,
      query.limit,
    );
  }

  async findById(id: number): Promise<ClientLeadResponseDto> {
    const lead = await this.findEntityByIdOrFail(id);
    return ClientLeadResponseDto.fromEntity(lead);
  }

  async findByClientId(clientId: number): Promise<ClientLeadResponseDto[]> {
    const leads = await this.clientLeadsRepository.findByClientId(clientId);
    return leads.map((lead) => ClientLeadResponseDto.fromEntity(lead));
  }

  // Ручная повторная отправка (ТЗ §7 п.3) — синхронная попытка прямо сейчас, не постановка в очередь
  // до следующего тика планировщика: админ должен сразу увидеть результат. Уже доставленный лид не
  // отправляется повторно — иначе двойной клик (или retry после того, как планировщик уже успел
  // доставить) создаёт дубль лида в самом Bitrix CRM.
  async retry(id: number): Promise<ClientLeadResponseDto> {
    const lead = await this.findEntityByIdOrFail(id);
    if (lead.status === LeadDeliveryStatus.SENT) {
      return ClientLeadResponseDto.fromEntity(lead);
    }
    const updated = await this.leadDeliveryService.attemptDelivery(lead);
    return ClientLeadResponseDto.fromEntity(updated);
  }

  private async findEntityByIdOrFail(id: number) {
    const lead = await this.clientLeadsRepository.findById(id);
    if (!lead) {
      throw new NotFoundException(`Заявка с ID ${id} не найдена`);
    }
    return lead;
  }
}
