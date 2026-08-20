import { BoundedTtlMap } from './bounded-ttl-map';

describe('BoundedTtlMap', () => {
  it('никогда не превышает maxSize, даже когда все записи ещё живы (атака быстрее TTL-окна)', () => {
    const map = new BoundedTtlMap<number>(3, () => false); // ничего не протухает

    map.set('a', 1);
    map.set('b', 2);
    map.set('c', 3);
    map.set('d', 4);
    map.set('e', 5);

    let size = 0;
    for (const key of ['a', 'b', 'c', 'd', 'e']) {
      if (map.get(key) !== undefined) size += 1;
    }
    expect(size).toBeLessThanOrEqual(3);
  });

  it('выселяет самые старые записи по порядку вставки (FIFO), а не случайные', () => {
    const map = new BoundedTtlMap<number>(2, () => false);

    map.set('first', 1);
    map.set('second', 2);
    map.set('third', 3);

    expect(map.get('first')).toBeUndefined();
    expect(map.get('second')).toBe(2);
    expect(map.get('third')).toBe(3);
  });

  it('повторный set() того же ключа переносит его в конец очереди (не вытесняется как старый)', () => {
    const map = new BoundedTtlMap<number>(2, () => false);

    map.set('a', 1);
    map.set('b', 2);
    map.set('a', 10); // 'a' снова свежий
    map.set('c', 3); // должен вытеснить 'b', не 'a'

    expect(map.get('a')).toBe(10);
    expect(map.get('b')).toBeUndefined();
    expect(map.get('c')).toBe(3);
  });

  it('предпочитает удалять протухшие записи, а не свежие', () => {
    const map = new BoundedTtlMap<{ expired: boolean }>(2, (v) => v.expired);

    map.set('stale', { expired: true });
    map.set('fresh', { expired: false });
    map.set('new', { expired: false });

    expect(map.get('stale')).toBeUndefined();
    expect(map.get('fresh')).toEqual({ expired: false });
    expect(map.get('new')).toEqual({ expired: false });
  });

  // R5 (round-2 review): защищённая (isProtected) запись не должна вытесняться вперемешку с
  // обычными — иначе заливка Map уникальными "мусорными" ключами быстрее TTL-окна сбрасывает
  // счётчик уже заблокированной жертвы (LoginUsernameThrottleGuard).
  it('вытесняет защищённую запись только когда все остальные уже вытеснены', () => {
    const map = new BoundedTtlMap<{ blocked: boolean }>(
      2,
      () => false,
      (v) => v.blocked,
    );

    map.set('victim', { blocked: true });
    map.set('garbage1', { blocked: false });
    map.set('garbage2', { blocked: false }); // вытесняет garbage1, не victim
    map.set('garbage3', { blocked: false }); // вытесняет garbage2, не victim

    expect(map.get('victim')).toEqual({ blocked: true });
    expect(map.get('garbage1')).toBeUndefined();
    expect(map.get('garbage2')).toBeUndefined();
    expect(map.get('garbage3')).toEqual({ blocked: false });
  });

  it('верхняя граница гарантирована даже если все записи защищены', () => {
    const map = new BoundedTtlMap<{ blocked: boolean }>(
      2,
      () => false,
      () => true,
    );

    map.set('a', { blocked: true });
    map.set('b', { blocked: true });
    map.set('c', { blocked: true });

    let size = 0;
    for (const key of ['a', 'b', 'c']) {
      if (map.get(key) !== undefined) size += 1;
    }
    expect(size).toBeLessThanOrEqual(2);
  });
});
