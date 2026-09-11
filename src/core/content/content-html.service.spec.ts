import { Test } from '@nestjs/testing';
import { PinoLogger } from 'nestjs-pino';
import { ContentHtmlService } from './content-html.service';
import { renderContentHtml } from './content-html.util';

// Фикстура со всеми типами нод и марок, которые встречаются в реальном архиве (срез X.0: doc,
// paragraph, heading, text, bulletList, orderedList, listItem, table, tableRow, tableCell,
// blockquote, hardBreak, image, callout + bold, italic, underline, link). Снапшот ниже — это
// контракт с админкой: её редактор и генератор собирают HTML из тех же расширений, и если
// разметка здесь поедет (например, разойдётся копия схемы callout), тест упадёт раньше, чем
// разъедутся материалы.
const FIXTURE = {
  type: 'doc',
  content: [
    {
      type: 'heading',
      attrs: { level: 2, textAlign: 'center' },
      content: [{ type: 'text', text: 'Заголовок' }],
    },
    {
      type: 'paragraph',
      attrs: { textAlign: null },
      content: [
        { type: 'text', marks: [{ type: 'bold' }], text: 'жирный' },
        { type: 'text', text: ', ' },
        { type: 'text', marks: [{ type: 'italic' }], text: 'курсив' },
        { type: 'text', text: ', ' },
        { type: 'text', marks: [{ type: 'underline' }], text: 'подчёркнутый' },
        { type: 'hardBreak' },
        {
          type: 'text',
          marks: [
            {
              type: 'link',
              attrs: { href: 'https://vals.digital', target: '_blank' },
            },
          ],
          text: 'ссылка',
        },
      ],
    },
    {
      type: 'bulletList',
      content: [
        {
          type: 'listItem',
          content: [
            {
              type: 'paragraph',
              attrs: { textAlign: null },
              content: [{ type: 'text', text: 'пункт' }],
            },
          ],
        },
      ],
    },
    {
      type: 'orderedList',
      attrs: { start: 1 },
      content: [
        {
          type: 'listItem',
          content: [
            {
              type: 'paragraph',
              attrs: { textAlign: null },
              content: [{ type: 'text', text: 'шаг' }],
            },
          ],
        },
      ],
    },
    {
      type: 'blockquote',
      content: [
        {
          type: 'paragraph',
          attrs: { textAlign: null },
          content: [{ type: 'text', text: 'цитата' }],
        },
      ],
    },
    {
      type: 'table',
      content: [
        {
          type: 'tableRow',
          content: [
            {
              type: 'tableCell',
              attrs: { colspan: 1, rowspan: 1, colwidth: null },
              content: [
                {
                  type: 'paragraph',
                  attrs: { textAlign: 'left' },
                  content: [{ type: 'text', text: 'ячейка' }],
                },
              ],
            },
          ],
        },
      ],
    },
    {
      type: 'image',
      attrs: { src: '/uploads/media/photo.jpg', alt: 'фото', title: null },
    },
    {
      type: 'callout',
      attrs: { variant: 'warning' },
      content: [
        {
          type: 'paragraph',
          attrs: { textAlign: null },
          content: [{ type: 'text', text: 'Внимание' }],
        },
      ],
    },
  ],
};

describe('renderContentHtml', () => {
  it('собирает разметку всех используемых нод', () => {
    expect(renderContentHtml(FIXTURE)).toMatchInlineSnapshot(
      `"<h2 style="text-align: center;">Заголовок</h2><p><strong>жирный</strong>, <em>курсив</em>, <u>подчёркнутый</u><br><a target="_blank" rel="noopener noreferrer nofollow" href="https://vals.digital">ссылка</a></p><ul><li><p>пункт</p></li></ul><ol><li><p>шаг</p></li></ol><blockquote><p>цитата</p></blockquote><table style="min-width: 25px;"><colgroup><col style="min-width: 25px;"></colgroup><tbody><tr><td colspan="1" rowspan="1"><p style="text-align: left;">ячейка</p></td></tr></tbody></table><img src="/uploads/media/photo.jpg" alt="фото"><div data-callout="warning" class="callout callout--warning"><p>Внимание</p></div>"`,
    );
  });

  it('callout сохраняет вариант в data-атрибуте и классе — по ним сайт его и красит', () => {
    const html = renderContentHtml({
      type: 'doc',
      content: [
        {
          type: 'callout',
          attrs: { variant: 'danger' },
          content: [
            {
              type: 'paragraph',
              attrs: { textAlign: null },
              content: [{ type: 'text', text: 'текст' }],
            },
          ],
        },
      ],
    });

    expect(html).toContain('data-callout="danger"');
    expect(html).toContain('class="callout callout--danger"');
  });

  it('xmlns не просачивается в разметку', () => {
    expect(renderContentHtml(FIXTURE)).not.toContain('xmlns');
  });
});

describe('ContentHtmlService — запасные варианты', () => {
  const buildService = async () => {
    const logger = { setContext: jest.fn(), error: jest.fn() };
    const moduleRef = await Test.createTestingModule({
      providers: [
        ContentHtmlService,
        { provide: PinoLogger, useValue: logger },
      ],
    }).compile();

    return { service: moduleRef.get(ContentHtmlService), logger };
  };

  it('обычный контент собирается беком', async () => {
    const { service } = await buildService();

    expect(service.render(FIXTURE, { clientHtml: '<p>от клиента</p>' })).toBe(
      renderContentHtml(FIXTURE),
    );
  });

  it('сборка упала — берётся HTML клиента, ошибка уходит в лог', async () => {
    const { service, logger } = await buildService();

    // Не документ ProseMirror — generateHTML на таком бросает.
    const html = service.render(
      { type: 'что-то-неизвестное' },
      { clientHtml: '<p>от клиента</p>', previousHtml: '<p>прежний</p>' },
    );

    expect(html).toBe('<p>от клиента</p>');
    expect(logger.error).toHaveBeenCalledTimes(1);
  });

  it('сборка упала и клиент HTML не прислал — остаётся прежний', async () => {
    const { service } = await buildService();

    expect(
      service.render(
        { type: 'что-то-неизвестное' },
        { previousHtml: '<p>прежний</p>' },
      ),
    ).toBe('<p>прежний</p>');
  });

  it('запасных вариантов нет — пустая строка, но исключение наружу не уходит', async () => {
    const { service } = await buildService();

    expect(service.render({ type: 'что-то-неизвестное' })).toBe('');
  });
});
