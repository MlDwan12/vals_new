import { sanitizeAuditBody } from './sanitize-audit-body.util';

describe('sanitizeAuditBody', () => {
  it('пропускает обычные поля как есть', () => {
    expect(sanitizeAuditBody({ title: 'Заголовок', priority: 5 })).toEqual({
      title: 'Заголовок',
      priority: 5,
    });
  });

  it('маскирует password/token/secret/hash/cookie/key независимо от регистра', () => {
    const body = {
      password: 'p1',
      newPassword: 'p2',
      passwordHash: 'p3',
      Token: 't1',
      refreshToken: 't2',
      SECRET: 's1',
      apiKey: 'k1',
      cookieValue: 'c1',
      title: 'не трогать',
    };

    expect(sanitizeAuditBody(body)).toEqual({
      password: '***',
      newPassword: '***',
      passwordHash: '***',
      Token: '***',
      refreshToken: '***',
      SECRET: '***',
      apiKey: '***',
      cookieValue: '***',
      title: 'не трогать',
    });
  });

  it('не маскирует keywords — "key" совпадает только как окончание имени, не подстрокой (code review high)', () => {
    expect(
      sanitizeAuditBody({
        keywords: 'стиральная машина, ремонт',
        apiKey: 'k1',
        signingKey: 'k2',
      }),
    ).toEqual({
      keywords: 'стиральная машина, ремонт',
      apiKey: '***',
      signingKey: '***',
    });
  });

  it('маскирует секрет во вложенном объекте на один уровень вглубь', () => {
    expect(
      sanitizeAuditBody({
        credentials: { apiKey: 'k1', note: 'не трогать' },
        title: 'не трогать тоже',
      }),
    ).toEqual({
      credentials: { apiKey: '***', note: 'не трогать' },
      title: 'не трогать тоже',
    });
  });

  it('заменяет bio/bioHtml сотрудников сводкой, как content/contentHtml', () => {
    const bio = { type: 'doc', content: [] };
    expect(
      sanitizeAuditBody({ name: 'Иван', bio, bioHtml: '<p>bio</p>' }),
    ).toEqual({
      name: 'Иван',
      bio: { changed: true, length: JSON.stringify(bio).length },
      bioHtml: { changed: true, length: '<p>bio</p>'.length },
    });
  });

  it('заменяет content/contentHtml сводкой вместо содержимого', () => {
    const content = { type: 'doc', content: [{ type: 'paragraph' }] };
    const result = sanitizeAuditBody({
      title: 'Статья',
      content,
      contentHtml: '<p>текст</p>',
    });

    expect(result).toEqual({
      title: 'Статья',
      content: { changed: true, length: JSON.stringify(content).length },
      // Строковое значение не сериализуется повторно ради длины — length считается напрямую.
      contentHtml: { changed: true, length: '<p>текст</p>'.length },
    });
  });

  it('не подменяет тело, если оно не объект (DELETE без тела и т.п.)', () => {
    expect(sanitizeAuditBody(undefined)).toBeUndefined();
    expect(sanitizeAuditBody(null)).toBeUndefined();
    expect(sanitizeAuditBody([1, 2, 3])).toBeUndefined();
    expect(sanitizeAuditBody('строка')).toBeUndefined();
  });

  it('пустое тело даёт пустой объект, не undefined', () => {
    expect(sanitizeAuditBody({})).toEqual({});
  });

  it('срабатывает общий потолок размера для крупного поля вне allowlist', () => {
    const hugeDescription = 'x'.repeat(20 * 1024);
    const result = sanitizeAuditBody({
      title: 'Заголовок',
      priority: 5,
      description: hugeDescription,
    });

    // Небольшие поля впереди сохраняются, крупное неучтённое поле — усечено, не потеряно молча.
    expect(result).toEqual(
      expect.objectContaining({ title: 'Заголовок', priority: 5 }),
    );
    expect(result?.__truncated).toBe(true);
    expect(result?.description).not.toBe(hugeDescription);
  });

  it('единственное огромное поле заменяется маркером, а не роняет санитайзер', () => {
    const hugeOnly = 'x'.repeat(50 * 1024);
    const result = sanitizeAuditBody({ description: hugeOnly });

    expect(result).toEqual({
      description: '[oversized]',
      __truncated: true,
    });
  });

  it('усечение не зависит от порядка полей — виновник первым в теле не топит соседей', () => {
    const hugeDescription = 'x'.repeat(20 * 1024);
    const result = sanitizeAuditBody({
      description: hugeDescription,
      title: 'Заголовок',
      priority: 5,
    });

    // Крупное поле стоит первым — наивная эвристика "резать с конца" потеряла бы title/priority
    // вместо него. Заменяется по размеру, а не по позиции.
    expect(result).toEqual({
      description: '[oversized]',
      title: 'Заголовок',
      priority: 5,
      __truncated: true,
    });
  });
});
