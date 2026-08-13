// Единая семантика PATCH на весь проект (ТЗ §7 п.4): поле отсутствует в теле запроса (undefined) —
// не трогаем; поле прислано как null — обнуляем. Один хелпер вместо повторяющихся `if (x !== undefined)`
// в каждом сервисе. Работает, потому что ValidationPipe с transform:true не создаёт own-property для
// полей, отсутствующих в теле запроса — только для реально присланных (в т.ч. null).
export function applyDefinedFields<T extends object>(
  target: T,
  patch: Partial<T>,
): void {
  for (const key of Object.keys(patch) as Array<keyof T>) {
    const value = patch[key];
    if (value !== undefined) {
      target[key] = value;
    }
  }
}
