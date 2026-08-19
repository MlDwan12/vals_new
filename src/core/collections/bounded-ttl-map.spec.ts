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
});
