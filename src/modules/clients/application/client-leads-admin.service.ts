import { Injectable, NotFoundException } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import {
  buildPaginatedResult,
  PaginatedResult,
} from '../../../core/pagination/paginated-result.interface';
import { ClientLeadListQueryDto } from '../dto/client-lead-list-query.dto';
import { ClientLeadResponseDto } from '../dto/client-lead-response.dto';
import { ClientLead } from '../domain/client-lead.entity';
import { ClientLeadsRepository } from '../infrastructure/client-leads.repository';
import { LeadDeliveryService } from './lead-delivery.service';

@Injectable()
export class ClientLeadsAdminService {
  constructor(
    private readonly clientLeadsRepository: ClientLeadsRepository,
    private readonly leadDeliveryService: LeadDeliveryService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(ClientLeadsAdminService.name);
  }

  async findAndCount(
    query: ClientLeadListQueryDto,
  ): Promise<PaginatedResult<ClientLeadResponseDto>> {
    const [items, total] = await this.clientLeadsRepository.findAndCount({
      clientId: query.clientId,
      type: query.type,
      formId: query.formId,
      pagePath: query.pagePath,
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
  // до следующего тика планировщика: админ должен сразу увидеть результат. claimForDelivery —
  // атомарный переход PENDING/FAILED -> SENDING: двойной клик или гонка с планировщиком, который
  // уже забрал этот же лид, получает null и просто возвращает текущее состояние без повторной
  // отправки (иначе — дубль лида в самом Bitrix CRM).
  async retry(id: number): Promise<ClientLeadResponseDto> {
    const claimed = await this.clientLeadsRepository.claimForDelivery(id);
    if (!claimed) {
      const lead = await this.findEntityByIdOrFail(id);
      return ClientLeadResponseDto.fromEntity(lead);
    }
    const updated = await this.attemptDeliverySafely(claimed);
    return ClientLeadResponseDto.fromEntity(updated);
  }

  // attemptDelivery может бросить, даже когда Bitrix уже принял лид — markSentWithRetry исчерпала
  // попытки записать SENT (лид остаётся в SENDING, bitrixLeadId уже залогирован для ручной сверки,
  // см. LeadDeliveryService). Без перехвата здесь админ видел бы голый 500 вместо реального
  // состояния лида — тот же приём, что в LeadDeliveryScheduler (security-audit-2026-08-31.md №14).
  private async attemptDeliverySafely(lead: ClientLead): Promise<ClientLead> {
    try {
      return await this.leadDeliveryService.attemptDelivery(lead);
    } catch (error) {
      this.logger.error(
        { leadId: lead.id, err: error },
        'attemptDelivery завершился необработанной ошибкой при ручном retry',
      );
      return this.findEntityByIdOrFail(lead.id);
    }
  }

  private async findEntityByIdOrFail(id: number) {
    const lead = await this.clientLeadsRepository.findById(id);
    if (!lead) {
      throw new NotFoundException(`Заявка с ID ${id} не найдена`);
    }
    return lead;
  }
}
