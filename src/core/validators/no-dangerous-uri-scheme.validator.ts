import { registerDecorator, ValidationOptions } from 'class-validator';

// javascript:/data:/vbscript: в поле, которое фронт когда-либо может отрендерить как ссылку
// (pagePath/referrer/landingPath заявки) — потенциальный stored XSS (security-audit-2026-08-31.md
// №15). Пробелы/control-символы убираются из всей строки перед сравнением, не только спереди —
// иначе "java\tscript:" (классический приём обхода naive-проверки схемы) проходит мимо.
const DANGEROUS_SCHEMES = ['javascript:', 'data:', 'vbscript:'];

// \p{Cc}/\p{Zs}/\p{Cf} (control/space separator/format), не литеральный диапазон \x00-\x20 —
// no-control-regex запрещает буквальные control-символы в паттерне, категории под правило не
// попадают. \p{Cf} обязателен: без него zero-width-символы (ZWSP U+200B, ZWNJ U+200C, WORD
// JOINER U+2060, BOM U+FEFF) не убираются, и схема с одним из них, вклиненным в середину имени
// (например между "java" и "script:"), проходит мимо той самой обфускации, для защиты от которой
// эта функция и написана (code review high).
const CONTROL_OR_WHITESPACE = /[\p{Cc}\p{Zs}\p{Cf}]/gu;

function stripControlAndWhitespace(value: string): string {
  return value.replace(CONTROL_OR_WHITESPACE, '');
}

export function hasDangerousUriScheme(value: string): boolean {
  const normalized = stripControlAndWhitespace(value).toLowerCase();
  return DANGEROUS_SCHEMES.some((scheme) => normalized.startsWith(scheme));
}

export function NoDangerousUriScheme(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'noDangerousUriScheme',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown): boolean {
          return typeof value !== 'string' || !hasDangerousUriScheme(value);
        },
        defaultMessage(): string {
          return 'Недопустимая схема URL';
        },
      },
    });
  };
}
