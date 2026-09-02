import { registerDecorator, ValidationOptions } from 'class-validator';
import { normalizePhone } from '../util/normalize-phone.util';

// Без этой проверки phone без единой цифры (например "x") нормализуется в null — advisory-лок в
// ClientLeadsRepository.resolveClient берётся только на непустое значение, matchConditions
// оказывается пустым, и дедупликация клиентов для такой заявки полностью отключается: каждый
// сабмит создаёт нового Client «без контактов» (security-audit-2026-08-31.md, MEDIUM №6).
export function IsNormalizablePhone(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isNormalizablePhone',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown): boolean {
          return typeof value === 'string' && normalizePhone(value) !== null;
        },
        defaultMessage(): string {
          return 'Некорректный формат телефона';
        },
      },
    });
  };
}
