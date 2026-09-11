import { FORM_ID_LABELS, FormId } from '../constants/form-id.registry';
import { ClientLeadType } from '../enums/client-lead-type.enum';
import { TariffSnapshot } from './tariff-snapshot.interface';

// Метки источника заявки в том виде, в каком они уже разложены по колонкам client_leads.
export interface LeadSourceMeta {
  formId: FormId | null;
  pagePath: string | null;
  blockId: string | null;
  referrer: string | null;
  landingPath: string | null;
}

interface BuildBitrixPayloadInput {
  type: ClientLeadType;
  name: string;
  phone: string;
  email: string | null;
  message: string | null;
  comment: string | null;
  tariff: TariffSnapshot | null;
  source: LeadSourceMeta;
}

// Длинный реферер режем: в карточке лида это одна справочная строка, а не данные для отчёта —
// полное значение всегда лежит в client_leads.referrer (до 2048 символов).
const REFERRER_COMMENT_MAX_LENGTH = 200;

/**
 * Метки источника текстом под сообщением клиента.
 *
 * Почему текстом, а не полями: UTM уезжают в штатные поля лида Bitrix (UTM_SOURCE и т.д.), а
 * штатного аналога для formId/pagePath нет — под них пришлось бы заводить пользовательские поля
 * руками в Bitrix у каждого, кто им пользуется. Цена решения принята осознанно: по тексту в Bitrix
 * нельзя фильтровать и строить отчёты. Настоящая аналитика — по нашей базе, где эти же метки лежат
 * отдельными колонками.
 */
export function buildSourceComment(source: LeadSourceMeta): string {
  const lines: string[] = [];

  if (source.formId) {
    lines.push(`Форма: ${FORM_ID_LABELS[source.formId]} (${source.formId})`);
  }
  if (source.pagePath) lines.push(`Страница: ${source.pagePath}`);
  if (source.blockId) lines.push(`Блок: ${source.blockId}`);
  if (source.landingPath) {
    lines.push(`Страница входа: ${source.landingPath}`);
  }
  if (source.referrer) {
    lines.push(
      `Переход с: ${source.referrer.length > REFERRER_COMMENT_MAX_LENGTH ? `${source.referrer.slice(0, REFERRER_COMMENT_MAX_LENGTH)}…` : source.referrer}`,
    );
  }

  if (lines.length === 0) return '';

  // Разделитель нужен, чтобы служебные строки не читались как продолжение сообщения клиента.
  return ['---', ...lines].join('\n');
}

function withSourceComment(base: string, source: LeadSourceMeta): string {
  const sourceComment = buildSourceComment(source);

  if (!sourceComment) return base;
  if (!base) return sourceComment;

  return `${base}\n\n${sourceComment}`;
}

const TITLE_BY_TYPE: Record<
  Exclude<ClientLeadType, ClientLeadType.TARIFF_REQUEST>,
  string
> = {
  [ClientLeadType.FREE_CONSULTATION]: 'Новая консультация с сайта',
  [ClientLeadType.PARTNER]: 'Новая заявка от партнера с сайта',
  [ClientLeadType.ADD_QUESTION]: 'Клиент задал вопрос с сайта',
  [ClientLeadType.FREE_AUDIT]: 'Новый аудит с сайта',
};

// Билдер Bitrix-пейлоада — перенос mapLeadToBitrixPayload из старого bitrix.service.ts, с починенным
// багом: UF_TARIFF_NAME/UF_TARIFF_PRICE раньше получали сырые tariffId/periodId вместо реального
// названия тарифа и цены (см. rewrite-log.md, сессия 7 / этап 5).
export function buildBitrixPayload(
  input: BuildBitrixPayloadInput,
): Record<string, unknown> {
  const commonWithoutComments: Record<string, unknown> = {
    NAME: input.name,
    PHONE: input.phone ? [{ VALUE: input.phone, VALUE_TYPE: 'WORK' }] : [],
    EMAIL: input.email ? [{ VALUE: input.email, VALUE_TYPE: 'WORK' }] : [],
    UF_CRM_CREATED_BY_API: true,
    SOURCE_ID: 'WEB',
  };

  if (input.type !== ClientLeadType.TARIFF_REQUEST) {
    return {
      TITLE: TITLE_BY_TYPE[input.type],
      COMMENTS: withSourceComment(
        input.message || input.comment || '',
        input.source,
      ),
      ...commonWithoutComments,
    };
  }

  if (!input.tariff) {
    throw new Error(
      'buildBitrixPayload: tariff snapshot is required for TARIFF_REQUEST',
    );
  }

  const { tariff } = input;

  return {
    TITLE: `Выбрана услуга - ${tariff.serviceName}`,
    COMMENTS: withSourceComment(
      `Выбрана услуга - ${tariff.serviceName} по тарифу: ${tariff.tariffName} на период ` +
        `${tariff.periodMonths} месяцев. Цена за месяц - ${tariff.pricePerMonth} руб. ` +
        `Общая стоимость: ${tariff.totalPrice} руб.`,
      input.source,
    ),
    ...commonWithoutComments,
    UF_TARIFF_NAME: tariff.tariffName,
    UF_TARIFF_PRICE: tariff.pricePerMonth,
  };
}

const UTM_KEYS = [
  'UTM_MEDIUM',
  'UTM_CAMPAIGN',
  'UTM_CONTENT',
  'UTM_TERM',
  'UTM_SOURCE',
] as const;

// Тот же приём фильтрации, что в старом bitrix.service.ts parseUtmForBitrix — только допустимые
// ключи, регистронезависимый поиск, пустые/непустые строки отбрасываются.
export function parseUtm(
  rawUtm: string | undefined,
): Record<string, string> | null {
  if (!rawUtm) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawUtm);
  } catch {
    return null;
  }

  if (typeof parsed !== 'object' || parsed === null) return null;
  const source = parsed as Record<string, unknown>;
  const result: Record<string, string> = {};

  for (const key of UTM_KEYS) {
    const value = source[key] ?? source[key.toLowerCase()];
    if (typeof value === 'string' && value.trim() !== '') {
      result[key] = value.trim();
    }
  }

  return Object.keys(result).length > 0 ? result : null;
}
