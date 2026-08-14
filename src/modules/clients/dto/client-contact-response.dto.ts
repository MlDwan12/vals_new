import { ClientContact } from '../domain/client-contact.entity';
import { ClientContactType } from '../enums/client-contact-type.enum';

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
    dto.value = contact.value;
    dto.isPrimary = contact.isPrimary;
    dto.createdAt = contact.createdAt;
    return dto;
  }
}
