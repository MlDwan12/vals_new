import { ClientLead } from '../domain/client-lead.entity';
import { ClientLeadType } from '../enums/client-lead-type.enum';
import { LeadDeliveryStatus } from '../enums/lead-delivery-status.enum';

export class ClientLeadResponseDto {
  id: number;
  clientId: number;
  externalSystem: string;
  type: ClientLeadType;
  name: string | null;
  phoneRaw: string | null;
  emailRaw: string | null;
  message: string | null;
  comment: string | null;
  utm: Record<string, string> | null;
  // Структурированные данные заявки (для TARIFF_REQUEST — снапшот тарифа на момент отправки, для
  // остальных типов — источник вида {blockId} из EXPANSION_TASKS.md §6), не regex-парсинг
  // Bitrix-комментария постфактум.
  payload: Record<string, unknown>;
  formId: string | null;
  pagePath: string | null;
  referrer: string | null;
  landingPath: string | null;
  userAgent: string | null;
  status: LeadDeliveryStatus;
  retryCount: number;
  nextRetryAt: Date | null;
  bitrixLeadId: string | null;
  bitrixError: string | null;
  createdAt: Date;

  static fromEntity(lead: ClientLead): ClientLeadResponseDto {
    const dto = new ClientLeadResponseDto();
    dto.id = lead.id;
    dto.clientId = lead.clientId;
    dto.externalSystem = lead.externalSystem;
    dto.type = lead.type;
    dto.name = lead.name;
    dto.phoneRaw = lead.phoneRaw;
    dto.emailRaw = lead.emailRaw;
    dto.message = lead.message;
    dto.comment = lead.comment;
    dto.utm = lead.utm;
    dto.payload = lead.payload;
    dto.formId = lead.formId;
    dto.pagePath = lead.pagePath;
    dto.referrer = lead.referrer;
    dto.landingPath = lead.landingPath;
    dto.userAgent = lead.userAgent;
    // SENDING — внутреннее переходное состояние claim-а (H10 code review), контракт ответа
    // (admin_front) построен под старые 3 значения статуса — наружу оно неотличимо от PENDING
    // (доставка ещё не подтверждена), а не отдельное значение, под которое фронт не готов.
    dto.status =
      lead.status === LeadDeliveryStatus.SENDING
        ? LeadDeliveryStatus.PENDING
        : lead.status;
    dto.retryCount = lead.retryCount;
    dto.nextRetryAt = lead.nextRetryAt;
    dto.bitrixLeadId = lead.bitrixLeadId;
    dto.bitrixError = lead.bitrixError;
    dto.createdAt = lead.createdAt;
    return dto;
  }
}
