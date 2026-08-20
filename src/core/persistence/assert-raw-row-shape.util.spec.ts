import { assertRawRowShape } from './assert-raw-row-shape.util';

describe('assertRawRowShape', () => {
  it('не бросает, если форма строки совпадает', () => {
    expect(() =>
      assertRawRowShape(
        { id: 1, slug: 'x' },
        { id: 'number', slug: 'string' },
        'ctx',
      ),
    ).not.toThrow();
  });

  it('бросает, если поле отсутствует (undefined — опечатка в алиасе)', () => {
    expect(() =>
      assertRawRowShape({ id: 1 }, { id: 'number', slug: 'string' }, 'ctx'),
    ).toThrow(/slug/);
  });

  it('бросает, если тип поля не совпадает', () => {
    expect(() =>
      assertRawRowShape({ id: '1' }, { id: 'number' }, 'ctx'),
    ).toThrow(/id/);
  });
});
