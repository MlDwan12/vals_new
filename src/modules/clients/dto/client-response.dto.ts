import { Client } from '../domain/client.entity';
import { maskEmail, maskPhone } from '../util/mask-contact.util';

export class ClientResponseDto {
  id: number;
  name: string | null;
  primaryPhone: string | null;
  primaryEmail: string | null;
  leadsCount: number;
  lastLeadAt: Date | null;
  createdAt: Date;

  static fromEntity(client: Client): ClientResponseDto {
    const dto = new ClientResponseDto();
    dto.id = client.id;
    dto.name = client.name;
    // Маски, как и в заявках (см. ClientLeadResponseDto): полные контакты — отдельной ручкой.
    dto.primaryPhone = maskPhone(client.primaryPhone);
    dto.primaryEmail = maskEmail(client.primaryEmail);
    dto.leadsCount = client.leadsCount;
    dto.lastLeadAt = client.lastLeadAt;
    dto.createdAt = client.createdAt;
    return dto;
  }
}
