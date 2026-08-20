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
    // Опционально: записи, для которых это истинно, вытесняются последними, не вперемешку с
    // обычными (R5, round-2 review). Пример — LoginUsernameThrottleGuard: заблокированная жертва
    // (count >= MAX_ATTEMPTS) не должна вытесняться раньше случайных "мусорных" логинов при
    // заливке Map уникальными ключами быстрее TTL-окна — иначе злоумышленник ботнетом с большим
    // числом IP обходит username-лимит вытеснением записи жертвы. По умолчанию — обычный FIFO
    // без защищённых записей (текущее поведение всех остальных потребителей).
    private readonly isProtected: (value: V) => boolean = () => false,
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
    // Проход 1: протухшие — можно чистить всегда, включая защищённые (протухшая запись по
    // определению больше не нуждается в защите).
    this.deleteWhile((value) => this.isExpired(value));
    // Проход 2: обычный FIFO, но защищённые записи пропускаются — вытесняются в последнюю очередь.
    this.deleteWhile((value) => !this.isProtected(value));
    // Проход 3: верхняя граница гарантируется безусловно (LOW code review) — если после первых
    // двух проходов всё ещё переполнено (например, все оставшиеся записи защищены), защита от
    // вытеснения уступает гарантии размера, не наоборот.
    this.deleteWhile(() => true);
  }

  // Map сохраняет порядок вставки — обход с начала и есть корректный FIFO без отдельной структуры.
  private deleteWhile(shouldDelete: (value: V) => boolean): void {
    for (const [key, value] of this.store) {
      if (this.store.size <= this.maxSize) return;
      if (shouldDelete(value)) {
        this.store.delete(key);
      }
    }
  }
}
