import { Client } from '../domain/client.entity';

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
    dto.primaryPhone = client.primaryPhone;
    dto.primaryEmail = client.primaryEmail;
    dto.leadsCount = client.leadsCount;
    dto.lastLeadAt = client.lastLeadAt;
    dto.createdAt = client.createdAt;
    return dto;
  }
}
