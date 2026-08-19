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
        : '';

    if (!bitrixLeadId) {
      // 2xx без числового/строкового result — Bitrix принял запрос, но не вернул id лида.
      // Отметится как SENT (успешная доставка была), но без него найти лид в CRM руками нельзя —
      // должно быть заметно в логах, не тихой деградацией.
      this.logger.warn(
        { response: response.data },
        'Bitrix ответил 2xx без числового result — bitrixLeadId не определён',
      );
    }

    return { bitrixLeadId, response: response.data };
  }
}
