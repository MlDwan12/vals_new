import { Transform } from 'class-transformer';
import { IsArray, IsOptional, IsString } from 'class-validator';

export class UploadMediaDto {
  // Alt-тексты по порядку файлов, длина массива не должна превышать количество файлов (проверяется в сервисе).
  @IsOptional()
  @Transform(({ value }: { value: unknown }): unknown => {
    if (value === undefined || value === null) return value;
    const arr: unknown[] = Array.isArray(value) ? value : [value];
    return arr.map((item) => (typeof item === 'string' ? item.trim() : item));
  })
  @IsArray()
  @IsString({ each: true })
  alt?: string[];
}
