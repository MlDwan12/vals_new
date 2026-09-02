import { ConflictException, NotFoundException } from '@nestjs/common';
import { ClientsAdminService } from './clients-admin.service';
import { Client } from '../domain/client.entity';

function buildClient(overrides: Partial<Client> = {}): Client {
  return { id: 1, isMerged: false, ...overrides } as Client;
}

interface Mocks {
  findById: jest.Mock;
  existsAsMergeTarget: jest.Mock;
  existsSentLeads: jest.Mock;
  remove: jest.Mock;
}

function buildRepository(overrides: Partial<Mocks> = {}): Mocks {
  return {
    findById: jest.fn().mockResolvedValue(buildClient()),
    existsAsMergeTarget: jest.fn().mockResolvedValue(false),
    existsSentLeads: jest.fn().mockResolvedValue(false),
    remove: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

// security-audit-2026-08-31.md, LOW №16 — две независимые проверки перед удалением:
// merged_into_client_id (SET NULL, не CASCADE) оставляло бы смерженные дубли «клиентами-
// призраками», client_leads.client_id (CASCADE) стирало бы историю уже отправленных в Bitrix
// заявок (вторая половина находки, добавлена по итогам /simplify altitude-проверки той же сессии).
describe('ClientsAdminService.remove', () => {
  it('клиент, в которого смёрджены дубли, не удаляется — 409, до проверки лидов', async () => {
    const repo = buildRepository({
      existsAsMergeTarget: jest.fn().mockResolvedValue(true),
    });
    const service = new ClientsAdminService(repo as never);

    await expect(service.remove(1)).rejects.toBeInstanceOf(ConflictException);
    expect(repo.remove).not.toHaveBeenCalled();
    expect(repo.existsSentLeads).not.toHaveBeenCalled();
  });

  it('клиент с уже отправленными в Bitrix лидами не удаляется — 409', async () => {
    const repo = buildRepository({
      existsSentLeads: jest.fn().mockResolvedValue(true),
    });
    const service = new ClientsAdminService(repo as never);

    await expect(service.remove(1)).rejects.toBeInstanceOf(ConflictException);
    expect(repo.remove).not.toHaveBeenCalled();
  });

  it('обычный клиент без смёрдженных дублей и без SENT-лидов удаляется как раньше', async () => {
    const repo = buildRepository();
    const service = new ClientsAdminService(repo as never);

    await service.remove(1);
    expect(repo.remove).toHaveBeenCalledWith(1);
  });

  it('несуществующий клиент — 404, остальные проверки не вызываются', async () => {
    const repo = buildRepository({
      findById: jest.fn().mockResolvedValue(null),
    });
    const service = new ClientsAdminService(repo as never);

    await expect(service.remove(1)).rejects.toBeInstanceOf(NotFoundException);
    expect(repo.existsAsMergeTarget).not.toHaveBeenCalled();
    expect(repo.existsSentLeads).not.toHaveBeenCalled();
  });
});
