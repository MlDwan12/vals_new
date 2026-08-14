export function normalizePhone(
  phone: string | null | undefined,
): string | null {
  if (!phone) {
    return null;
  }

  const digits = phone.replace(/\D/g, '');

  if (!digits) {
    return null;
  }

  if (digits.length === 11 && digits.startsWith('8')) {
    return `7${digits.slice(1)}`;
  }

  if (digits.length === 11 && digits.startsWith('7')) {
    return digits;
  }

  if (digits.length === 10) {
    return `7${digits}`;
  }

  return digits.length >= 10 ? digits : null;
}
