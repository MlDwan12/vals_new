import { ClientLead } from '../domain/client-lead.entity';

// Полные контакты заявки — ровно так, как клиент ввёл их в форме (для звонка и письма), без
// остальных полей: всё прочее уже есть в обычном ответе с масками.
export class ClientLeadContactsResponseDto {
  phone: string | null;
  email: string | null;

  static fromEntity(lead: ClientLead): ClientLeadContactsResponseDto {
    const dto = new ClientLeadContactsResponseDto();
    dto.phone = lead.phoneRaw;
    dto.email = lead.emailRaw;
    return dto;
  }
}
