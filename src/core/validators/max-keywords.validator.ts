import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
} from 'class-validator';

// Поле keywords хранится строкой через запятую (SEO), не массивом — ограничение на количество
// фраз проверяется этим декоратором. Используется articles/cases/services (везде одно и то же поле).
export function MaxKeywords(
  max: number,
  validationOptions?: ValidationOptions,
) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'maxKeywords',
      target: object.constructor,
      propertyName,
      constraints: [max],
      options: validationOptions,
      validator: {
        validate(value: unknown, args: ValidationArguments): boolean {
          if (value == null || value === '') {
            return true;
          }
          if (typeof value !== 'string') {
            return false;
          }

          const maxKeywords = args.constraints[0] as number;
          const keywords = value
            .split(',')
            .map((keyword) => keyword.trim())
            .filter(Boolean);

          return keywords.length <= maxKeywords;
        },
        defaultMessage(args: ValidationArguments): string {
          return `Можно указать не более ${String(args.constraints[0])} ключевых фраз`;
        },
      },
    });
  };
}
