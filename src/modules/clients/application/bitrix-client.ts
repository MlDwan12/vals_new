import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { PinoLogger } from 'nestjs-pino';
import { EnvConfig } from '../../../config/env.validation';

export interface BitrixDeliveryResult {
  bitrixLeadId: string;
  response: Record<string, unknown>;
}

// Тонкая обёртка над HTTP-вызовом Bitrix — отдельный инжектируемый провайдер специально для того,
// чтобы в тестах (приём заявки при недоступном Bitrix) подменить его моком, не поднимая реальный
// внешний HTTP.
@Injectable()
export class BitrixClient {
  constructor(
    private readonly configService: ConfigService<EnvConfig, true>,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(BitrixClient.name);
  }

  async sendLead(
    payload: Record<string, unknown>,
  ): Promise<BitrixDeliveryResult> {
    const webhook = this.configService.get('BITRIX_WEBHOOK', { infer: true });
    if (!webhook) {
      throw new InternalServerErrorException('Webhook Bitrix не настроен');
    }

    const response = await axios.post<Record<string, unknown>>(
      `${webhook}/crm.lead.add`,
      { fields: payload },
      { timeout: 10_000 },
    );

    const result = response.data.result;
    const bitrixLeadId =
      typeof result === 'string' || typeof result === 'number'
        ? String(result)
        : null;

    if (!bitrixLeadId) {
      // Bitrix отвечает ошибками HTTP-статусом 200 с телом {error, error_description} (N1,
      // round-2 review) — если бы мы вернули пустой bitrixLeadId как успех, лид отмечался бы SENT
      // без реальной доставки. Бросаем — уходит в тот же retry/классификацию, что сетевые ошибки.
      // Message берёт только задокументированные поля Bitrix-ошибки, не весь response.data целиком
      // (Б1, независимый аудит 2026-08-21) — это сообщение оседает и в логах (LeadDeliveryService),
      // и в bitrixError в БД, а тело ответа Bitrix может эхом содержать отправленные нами ПД лида.
      const data =
        response.data && typeof response.data === 'object' ? response.data : {};
      const description = data.error_description ?? data.error;
      const suffix = typeof description === 'string' ? `: ${description}` : '';
      throw new Error(`Bitrix ответил 2xx без result${suffix}`);
    }

    return { bitrixLeadId, response: response.data };
  }
}
