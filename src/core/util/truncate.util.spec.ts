import { truncate } from './truncate.util';

describe('truncate', () => {
  it('не трогает строку короче лимита', () => {
    expect(truncate('короче', 100)).toBe('короче');
  });

  it('обрезает строку длиннее лимита ровно до лимита', () => {
    expect(truncate('a'.repeat(10), 5)).toBe('aaaaa');
  });

  it('не разрывает суррогатную пару, если граница попадает на её середину', () => {
    // '😀' — суррогатная пара (2 code unit'а UTF-16), длина строки 3 (1 обычный символ + пара).
    const value = `x${'😀'}`;
    expect(value).toHaveLength(3);

    const result = truncate(value, 2);

    // Обрезка ровно по границе пары (индекс 2) дала бы непарный суррогат — вместо этого отступаем
    // на символ раньше.
    expect(result).toBe('x');
    expect(result.charCodeAt(result.length - 1)).toBeLessThan(0xd800);
  });

  it('сохраняет пару целиком, если граница проходит после неё', () => {
    const value = `x${'😀'}y`;
    const result = truncate(value, 3);
    expect(result).toBe('x😀');
  });
});
