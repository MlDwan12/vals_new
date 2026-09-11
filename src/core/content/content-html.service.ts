import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { renderContentHtml } from './content-html.util';

interface HtmlFallback {
  /** HTML, присланный клиентом. Переходный период среза X — в X.3 админка перестанет его слать. */
  clientHtml?: string | null;
  /** HTML, который уже лежит у материала. */
  previousHtml?: string | null;
}

/**
 * Сборка HTML материала из JSON редактора — один источник правды вместо двух.
 *
 * Раньше HTML собирала админка и присылала вместе с JSON: ничто не мешало им разойтись, а
 * перегенерировать архив было неоткуда. Теперь его собирает бек, а присланный остаётся только
 * запасным вариантом.
 */
@Injectable()
export class ContentHtmlService {
  constructor(private readonly logger: PinoLogger) {
    this.logger.setContext(ContentHtmlService.name);
  }

  /**
   * Никогда не бросает: сайт рендерит готовый HTML и из JSON его собрать не умеет, поэтому пустой
   * HTML — это пустая страница. Упавшая сборка не должна ни ронять сохранение материала, ни
   * стирать то, что уже показывается: берём присланный клиентом, а если и его нет — прежний.
   */
  render(content: unknown, fallback: HtmlFallback = {}): string {
    try {
      return renderContentHtml(content);
    } catch (error) {
      const replacement = fallback.clientHtml ?? fallback.previousHtml ?? '';

      this.logger.error(
        {
          err: error,
          usedFallback: fallback.clientHtml
            ? 'клиентский HTML'
            : fallback.previousHtml
              ? 'прежний HTML'
              : 'пусто',
        },
        'Не удалось собрать HTML материала — сохраняем запасной вариант',
      );

      return replacement;
    }
  }
}
