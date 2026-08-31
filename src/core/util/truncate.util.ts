import { Transform } from 'class-transformer';

// Обрезка вместо отклонения — для полей, где длинное значение не должно ронять заявку целиком
// (EXPANSION_TASKS.md §7: "длины ограничить, значения обрезать, а не отклонять заявку из-за
// длинного URL"), в отличие от message/comment, где превышение лимита — это ошибка валидации.
export function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  let end = maxLength;
  // .slice() режет по code unit'ам UTF-16 — если maxLength попадает ровно на старшую половину
  // суррогатной пары (эмодзи и т.п.), пара разорвётся и в строке останется непарный суррогат
  // (code-review high: непарный суррогат при кодировании в UTF-8 для INSERT молча превращается в
  // U+FFFD вместо аккуратной обрезки). Отступаем на один символ раньше, если так.
  const code = value.charCodeAt(end - 1);
  if (code >= 0xd800 && code <= 0xdbff) end -= 1;
  return value.slice(0, end);
}

// Декоратор для необязательных строковых DTO-полей с той же семантикой — оборачивает truncate() в
// class-transformer @Transform один раз, а не переопределяется на каждом обрезаемом поле.
export function TruncateString(maxLength: number): PropertyDecorator {
  return Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? truncate(value, maxLength) : value,
  );
}
