import { mergeAttributes, Node } from '@tiptap/core';

/**
 * Схема ноды «callout» — нашего расширения редактора. Здесь только то, что нужно для сборки HTML:
 * имя, вложенность, атрибут варианта и разметка. Команды, клавиши и поведение курсора остаются в
 * админке (`shared/ui/RichTextEditor/CalloutBlock.ts`) — беку они не нужны, а копировать их значило
 * бы тащить сюда зависимость от редактора.
 *
 * Копия, а не общий пакет: решение 2026-09-11 — заводить третий репозиторий ради одного файла
 * дороже, чем держать копию под снапшот-тестом, тем более что при переезде в монорепозиторий она
 * схлопнется обратно. Разъехавшуюся разметку ловит `content-html.service.spec.ts`.
 */
export const CalloutBlockSchema = Node.create({
  name: 'callout',
  group: 'block',
  content: 'block+',

  addAttributes() {
    return {
      variant: {
        default: 'info',
        parseHTML: (element) => element.getAttribute('data-callout'),
        renderHTML: (attributes: { variant?: string }) => ({
          'data-callout': attributes.variant,
          class: `callout callout--${attributes.variant}`,
        }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-callout]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes), 0];
  },
});
