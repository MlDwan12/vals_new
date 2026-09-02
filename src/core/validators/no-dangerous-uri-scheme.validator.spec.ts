import { hasDangerousUriScheme } from './no-dangerous-uri-scheme.validator';

describe('hasDangerousUriScheme', () => {
  it('пропускает обычные пути и URL', () => {
    expect(hasDangerousUriScheme('/services/remont-stiralnyh-mashin')).toBe(
      false,
    );
    expect(hasDangerousUriScheme('https://google.com/search?q=remont')).toBe(
      false,
    );
  });

  it('ловит javascript:/data:/vbscript: без обфускации', () => {
    expect(hasDangerousUriScheme('javascript:alert(1)')).toBe(true);
    expect(
      hasDangerousUriScheme('data:text/html,<script>alert(1)</script>'),
    ).toBe(true);
    expect(hasDangerousUriScheme('VBScript:msgbox(1)')).toBe(true);
  });

  it('ловит ведущие пробелы перед схемой', () => {
    expect(hasDangerousUriScheme('   javascript:alert(1)')).toBe(true);
  });

  it('ловит control-символы, вклиненные в название схемы (классический обход)', () => {
    expect(hasDangerousUriScheme('java\tscript:alert(1)')).toBe(true);
    expect(hasDangerousUriScheme('java\nscript:alert(1)')).toBe(true);
  });

  // code review high: \p{Cc}/\p{Zs} одни не ловят zero-width-обфускацию — нужна ещё \p{Cf}.
  // String.fromCodePoint, не литеральный невидимый символ в исходнике — иначе символ непроверяем
  // глазами и может быть случайно потерян при копировании/редактировании файла.
  it('ловит zero-width-символы, вклиненные в название схемы', () => {
    const ZWSP = String.fromCodePoint(0x200b);
    const ZWNJ = String.fromCodePoint(0x200c);
    const BOM = String.fromCodePoint(0xfeff);

    expect(hasDangerousUriScheme(`java${ZWSP}script:alert(1)`)).toBe(true);
    expect(hasDangerousUriScheme(`java${ZWNJ}script:alert(1)`)).toBe(true);
    expect(hasDangerousUriScheme(`${BOM}javascript:alert(1)`)).toBe(true);
  });
});
