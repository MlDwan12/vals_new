import { FORM_IDS } from '../constants/form-id.registry';
import { ClientLeadType } from '../enums/client-lead-type.enum';
import {
  buildBitrixPayload,
  buildSourceComment,
  LeadSourceMeta,
} from './bitrix-payload.util';
import { TariffSnapshot } from './tariff-snapshot.interface';

const EMPTY_SOURCE: LeadSourceMeta = {
  formId: null,
  pagePath: null,
  blockId: null,
  referrer: null,
  landingPath: null,
};

const TARIFF: TariffSnapshot = {
  serviceName: 'SEO-продвижение',
  tariffName: 'Базовый',
  periodMonths: 6,
  pricePerMonth: 50000,
  totalPrice: 300000,
};

describe('buildSourceComment', () => {
  it('без меток — пустая строка (разделитель не появляется)', () => {
    expect(buildSourceComment(EMPTY_SOURCE)).toBe('');
  });

  it('форма выводится человекочитаемым названием и slug-ом', () => {
    expect(
      buildSourceComment({
        ...EMPTY_SOURCE,
        formId: FORM_IDS.ADD_QUESTION,
      }),
    ).toBe('---\nФорма: Вопрос с сайта (add-question)');
  });

  it('выводятся только заполненные метки, порядок фиксирован', () => {
    expect(
      buildSourceComment({
        formId: FORM_IDS.FREE_CONSULTATION,
        pagePath: '/services/seo',
        blockId: 'hero',
        referrer: 'https://ya.ru/search',
        landingPath: '/?utm_source=yandex',
      }),
    ).toBe(
      [
        '---',
        'Форма: Бесплатная консультация (free-consultation)',
        'Страница: /services/seo',
        'Блок: hero',
        'Страница входа: /?utm_source=yandex',
        'Переход с: https://ya.ru/search',
      ].join('\n'),
    );
  });

  it('длинный реферер обрезается — в карточке это справочная строка', () => {
    const referrer = `https://example.com/${'a'.repeat(500)}`;

    const comment = buildSourceComment({ ...EMPTY_SOURCE, referrer });

    expect(comment).toContain('…');
    expect(comment.length).toBeLessThan(referrer.length);
  });
});

describe('buildBitrixPayload + метки источника', () => {
  it('метки идут под сообщением клиента, само сообщение не меняется', () => {
    const payload = buildBitrixPayload({
      type: ClientLeadType.FREE_CONSULTATION,
      name: 'Иван',
      phone: '+79990000000',
      email: null,
      message: 'Нужна помощь с отзывами',
      comment: null,
      tariff: null,
      source: { ...EMPTY_SOURCE, formId: FORM_IDS.PARTNER, pagePath: '/' },
    });

    expect(payload.COMMENTS).toBe(
      'Нужна помощь с отзывами\n\n---\nФорма: Заявка от партнёра (partner)\nСтраница: /',
    );
  });

  it('без сообщения и без меток COMMENTS остаётся пустым, как до среза D', () => {
    const payload = buildBitrixPayload({
      type: ClientLeadType.FREE_CONSULTATION,
      name: 'Иван',
      phone: '+79990000000',
      email: null,
      message: null,
      comment: null,
      tariff: null,
      source: EMPTY_SOURCE,
    });

    expect(payload.COMMENTS).toBe('');
  });

  it('у заявки на тариф метки дописываются после описания тарифа', () => {
    const payload = buildBitrixPayload({
      type: ClientLeadType.TARIFF_REQUEST,
      name: 'Иван',
      phone: '+79990000000',
      email: 'ivan@example.com',
      message: null,
      comment: null,
      tariff: TARIFF,
      source: {
        ...EMPTY_SOURCE,
        formId: FORM_IDS.TARIFF_REQUEST,
        blockId: 'service-cta',
      },
    });

    expect(payload.COMMENTS).toBe(
      'Выбрана услуга - SEO-продвижение по тарифу: Базовый на период 6 месяцев. ' +
        'Цена за месяц - 50000 руб. Общая стоимость: 300000 руб.\n\n' +
        '---\nФорма: Заявка на тариф (tariff-request)\nБлок: service-cta',
    );
    expect(payload.UF_TARIFF_NAME).toBe('Базовый');
  });
});
