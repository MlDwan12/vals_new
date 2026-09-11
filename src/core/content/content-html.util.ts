import type { Extensions } from '@tiptap/core';
// Серверная сборка: обычный '@tiptap/html' требует DOM и в Node бросает с прямой подсказкой
// использовать этот импорт. Разметку он собирает своим DOM-ом, поэтому результат обязательно
// сверяется с тем, что генерировала админка (срез X.0), а не принимается на веру.
import { generateHTML } from '@tiptap/html/server';
import Image from '@tiptap/extension-image';
import { TableKit } from '@tiptap/extension-table';
import TextAlign from '@tiptap/extension-text-align';
import StarterKit from '@tiptap/starter-kit';
import { CalloutBlockSchema } from './callout-block.schema';

// Тот же список и та же настройка, что у редактора и генератора в админке
// (admin_front/src/shared/lib/tiptap/generateHtml.ts) — иначе HTML разъедется на ровном месте.
// Версии tiptap тоже держим одинаковыми (3.27.1).
const EXTENSIONS: Extensions = [
  StarterKit.configure({ link: { openOnClick: false, autolink: false } }),
  TextAlign.configure({
    types: ['heading', 'paragraph', 'tableCell', 'tableHeader'],
  }),
  TableKit.configure({
    table: { resizable: true },
  }),
  Image,
  CalloutBlockSchema,
];

// generateHTML отдаёт узлы с xmlns — админка его убирала постобработкой, повторяем ровно то же,
// иначе перегенерация архива покажет расхождение в каждом материале.
const XMLNS_ATTRIBUTE = / xmlns="http:\/\/www\.w3\.org\/1999\/xhtml"/g;

export function renderContentHtml(content: unknown): string {
  return generateHTML(content as never, EXTENSIONS).replace(
    XMLNS_ATTRIBUTE,
    '',
  );
}
