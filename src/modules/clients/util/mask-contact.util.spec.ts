import { maskEmail, maskPhone } from './mask-contact.util';

describe('maskPhone', () => {
  it('российский номер в любой записи маскируется одинаково', () => {
    const masked = '+7 900 ***-**-33';
    expect(maskPhone('79001112233')).toBe(masked);
    expect(maskPhone('+7 (900) 111-22-33')).toBe(masked);
    expect(maskPhone('8 900 111 22 33')).toBe(masked);
    expect(maskPhone('9001112233')).toBe(masked);
  });

  it('номер другой длины: видны первые 3 и последние 2 цифры', () => {
    expect(maskPhone('+375 29 123 45 67')).toBe('375*******67');
  });

  it('слишком короткое значение не раскрывается даже частично', () => {
    expect(maskPhone('12345')).toBe('***');
    expect(maskPhone('телефон')).toBe('***');
  });

  it('пустое значение остаётся пустым', () => {
    expect(maskPhone(null)).toBeNull();
    expect(maskPhone('')).toBeNull();
  });
});

describe('maskEmail', () => {
  it('видны первая буква и домен', () => {
    expect(maskEmail('khant2709@gmail.com')).toBe('k***@gmail.com');
  });

  it('берётся последний @ — локальная часть в кавычках может содержать свой', () => {
    expect(maskEmail('"a@b"@example.com')).toBe('"***@example.com');
  });

  it('значение без адреса или домена не раскрывается', () => {
    expect(maskEmail('no-at-sign')).toBe('***');
    expect(maskEmail('@example.com')).toBe('***');
    expect(maskEmail('user@')).toBe('***');
  });

  it('пустое значение остаётся пустым', () => {
    expect(maskEmail(null)).toBeNull();
    expect(maskEmail('')).toBeNull();
  });
});
