import axios from 'axios';
import { PinoLogger } from 'nestjs-pino';
import { BitrixClient } from './bitrix-client';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('BitrixClient.sendLead', () => {
  let client: BitrixClient;

  beforeEach(() => {
    const configService = {
      get: jest.fn().mockReturnValue('https://bitrix.example/webhook'),
    };
    const logger = {
      setContext: jest.fn(),
      warn: jest.fn(),
    } as unknown as PinoLogger;
    client = new BitrixClient(configService as never, logger);
  });

  it('возвращает bitrixLeadId при нормальном ответе', async () => {
    mockedAxios.post.mockResolvedValue({ data: { result: 123 } });

    const result = await client.sendLead({});

    expect(result.bitrixLeadId).toBe('123');
  });

  // N1 (round-2 review): Bitrix отвечает ошибками HTTP-статусом 200 с телом {error, ...} — раньше
  // это трактовалось как успешная доставка с пустым bitrixLeadId.
  it('бросает, если Bitrix ответил 2xx без result (ошибка в теле)', async () => {
    mockedAxios.post.mockResolvedValue({
      data: { error: 'INVALID_TOKEN', error_description: 'Wrong webhook' },
    });

    await expect(client.sendLead({})).rejects.toThrow();
  });
});
