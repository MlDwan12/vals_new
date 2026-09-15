import { normalizePhone } from './normalize-phone.util';

// Маски контактов в ответах админки: по ним заявку узнают глазами («тот, что на …33 и с gmail»),
// но переписать номер или почту целиком нельзя. Полные контакты — только через отдельную ручку
// с правом clients.view_contacts, и каждый такой просмотр пишется в журнал действий.

export function maskPhone(value: string | null): string | null {
  if (!value) return null;

  // Нормализованный номер, если получится: «8 900…» и «+7 900…» маскируются одинаково.
  const digits = normalizePhone(value) ?? value.replace(/\D/g, '');

  if (digits.length === 11) {
    return `+${digits[0]} ${digits.slice(1, 4)} ***-**-${digits.slice(-2)}`;
  }
  if (digits.length >= 6) {
    return `${digits.slice(0, 3)}${'*'.repeat(digits.length - 5)}${digits.slice(-2)}`;
  }
  return '***';
}

export function maskEmail(value: string | null): string | null {
  if (!value) return null;

  const at = value.lastIndexOf('@');
  if (at <= 0 || at === value.length - 1) return '***';

  // Домен виден целиком: по нему понятно, частный это ящик или корпоративный, а сам адрес — нет.
  return `${value[0]}***${value.slice(at)}`;
}
