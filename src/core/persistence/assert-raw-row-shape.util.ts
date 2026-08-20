// Проверка формы "сырых" строк после getRawMany<T>()/getRawOne<T>() — generic-параметр TypeORM
// ничего не проверяет в рантайме сам по себе, опечатка в алиасе колонки (`.addSelect('x', 'y')`)
// или потерянный JOIN молча дают undefined на месте ожидаемого значения (ТЗ §3.3 п.4: без
// последующей проверки это "ложь компилятору"). Проверяет только typeof по ключевым полям, не
// полноценная схема — этого достаточно, чтобы поймать опечатку в алиасе/пропавшую колонку.
export function assertRawRowShape(
  row: object,
  expectedTypes: Record<string, 'string' | 'number' | 'boolean'>,
  context: string,
): void {
  const record = row as Record<string, unknown>;
  for (const [key, type] of Object.entries(expectedTypes)) {
    if (typeof record[key] !== type) {
      throw new Error(
        `${context}: строка из raw-запроса не соответствует ожидаемой форме — поле "${key}" ` +
          `имеет тип ${typeof record[key]}, ожидался ${type} (опечатка в алиасе колонки?)`,
      );
    }
  }
}
