import { ClientContact } from '../domain/client-contact.entity';
import { ClientContactType } from '../enums/client-contact-type.enum';
import { maskEmail, maskPhone } from '../util/mask-contact.util';

export class ClientContactResponseDto {
  id: number;
  clientId: number;
  type: ClientContactType;
  value: string;
  isPrimary: boolean;
  createdAt: Date;

  static fromEntity(contact: ClientContact): ClientContactResponseDto {
    const dto = new ClientContactResponseDto();
    dto.id = contact.id;
    dto.clientId = contact.clientId;
    dto.type = contact.type;
    // Маска, как и в заявках (см. ClientLeadResponseDto). value в базе не пустой — `?? ''` только
    // для типа: маска пустого значения возвращает null.
    dto.value =
      (contact.type === ClientContactType.PHONE
        ? maskPhone(contact.value)
        : maskEmail(contact.value)) ?? '';
    dto.isPrimary = contact.isPrimary;
    dto.createdAt = contact.createdAt;
    return dto;
  }
}
