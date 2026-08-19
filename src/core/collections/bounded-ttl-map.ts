// Map с гарантированной верхней границей размера — общий приём для двух state-хранилищ, ключи
// которых контролирует клиент (username в LoginUsernameThrottleGuard, IP в HttpExceptionFilter):
// без этого злоумышленник, перебирающий случайные ключи, растит Map неограниченно (LOW code
// review). Не Redis — вне рамок ТЗ §12, для админ-панели с ограниченной реальной нагрузкой это
// приемлемо.
//
// set() сначала пытается освободить место протухшими (isExpired) записями — дёшево и не теряет
// ничего живого. Если атакующий шлёт уникальные ключи быстрее TTL-окна, протухших записей может
// не найтись вообще — тогда чистка протухших не защитила бы от неограниченного роста (была ровно
// такая дыра при первой версии этого класса, поймано code review). Второй, гарантирующий проход
// довыселяет самые старые записи по порядку вставки, пока размер не вернётся к лимиту — Map
// сохраняет порядок вставки, так что это корректный FIFO-выселение без отдельной структуры.
export class BoundedTtlMap<V> {
  private readonly store = new Map<string, V>();

  constructor(
    private readonly maxSize: number,
    private readonly isExpired: (value: V) => boolean,
  ) {}

  get(key: string): V | undefined {
    return this.store.get(key);
  }

  set(key: string, value: V): void {
    // Удаление перед set() переносит ключ в конец порядка вставки при обновлении существующей
    // записи — активные ключи естественно "молодеют" и не становятся кандидатами на FIFO-выселение.
    this.store.delete(key);
    this.store.set(key, value);

    if (this.store.size > this.maxSize) {
      this.evictOverflow();
    }
  }

  private evictOverflow(): void {
    for (const [key, value] of this.store) {
      if (this.store.size <= this.maxSize) return;
      if (this.isExpired(value)) {
        this.store.delete(key);
      }
    }

    while (this.store.size > this.maxSize) {
      const oldestKey = this.store.keys().next().value;
      if (oldestKey === undefined) return;
      this.store.delete(oldestKey);
    }
  }
}
