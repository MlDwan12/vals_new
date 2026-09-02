import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
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
    // Клиент, в которого смёрджены дубли — удаление оставило бы их isMerged:true без
    // mergedIntoClientId (FK — SET NULL, не CASCADE), «клиентами-призраками» вне дефолтного списка
    // (security-audit-2026-08-31.md №16).
    if (await this.clientsRepository.existsAsMergeTarget(id)) {
      throw new ConflictException(
        'Клиента нельзя удалить — в него смёрджены другие клиенты',
      );
    }
    // client_leads.client_id — CASCADE: удаление клиента стёрло бы локальную историю уже
    // подтверждённых доставок в Bitrix безвозвратно, хотя сам лид в CRM остаётся (вторая половина
    // security-audit-2026-08-31.md №16, найдено при /simplify altitude-проверкой этой же сессии —
    // изначально пофикшена только merge-target часть).
    if (await this.clientsRepository.existsSentLeads(id)) {
      throw new ConflictException(
        'Клиента нельзя удалить — у него есть заявки, уже отправленные в Bitrix',
      );
    }
    // Принятый остаточный TOCTOU (code review high): обе проверки выше — check-then-act без
    // лока/транзакции. Конкурентный merge (submitLead → mergeClients) или доставка лида
    // (LeadDeliveryScheduler → markSent) между проверкой и этим DELETE воспроизводит ровно тот же
    // исход, который проверки должны предотвращать. В отличие от TOCTOU у case-faq/cases/
    // service-relations (эта же сессия), здесь нет FK-violation, который можно поймать на самом
    // DELETE (SET NULL/CASCADE не бросают) — закрыть до конца можно только блокировкой строки
    // клиента, которую пришлось бы завести и на стороне merge/delivery тоже, а это уже не про
    // clients-admin, а про горячие пути приёма заявок и доставки. Непропорционально для LOW,
    // admin-only находки (security-audit-2026-08-31.md №16) — не чиним, риск узкий и редкий.
    await this.clientsRepository.remove(id);
  }
}
