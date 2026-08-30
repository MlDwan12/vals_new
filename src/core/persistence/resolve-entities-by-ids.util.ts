import { BadRequestException } from '@nestjs/common';

function assertAllFound(
  label: string,
  requested: number[],
  found: number[],
): void {
  if (found.length === requested.length) return;

  const foundSet = new Set(found);
  const missing = requested.filter((id) => !foundSet.has(id));
  throw new BadRequestException(`${label} не найдены: ${missing.join(', ')}`);
}

// Разрешение id -> сущности для обязательной непустой связи (authors/services): пустой список —
// ошибка валидации, а не молчаливое "ничего не привязано".
export async function resolveRequiredEntitiesByIds<T extends { id: number }>(
  ids: number[],
  findByIds: (ids: number[]) => Promise<T[]>,
  label: string,
  fieldName: string,
): Promise<T[]> {
  const uniqueIds = Array.from(new Set(ids));
  if (uniqueIds.length === 0) {
    throw new BadRequestException(`${fieldName} не должен быть пустым`);
  }

  const found = await findByIds(uniqueIds);
  assertAllFound(
    label,
    uniqueIds,
    found.map((entity) => entity.id),
  );
  return found;
}

// То же самое, но связь опциональна (tags) — пустой/отсутствующий список это валидное "без тегов".
export async function resolveOptionalEntitiesByIds<T extends { id: number }>(
  ids: number[] | undefined,
  findByIds: (ids: number[]) => Promise<T[]>,
  label: string,
): Promise<T[]> {
  const uniqueIds = Array.from(new Set(ids ?? []));
  if (uniqueIds.length === 0) return [];

  const found = await findByIds(uniqueIds);
  assertAllFound(
    label,
    uniqueIds,
    found.map((entity) => entity.id),
  );
  return found;
}

// Одиночная опциональная связь (cover_media_id) — null/undefined это валидное "без обложки",
// несуществующий id — ошибка валидации. Аналог resolveOptionalEntitiesByIds для one-to-one FK, не
// массива; ServicesService.resolveCategory — тот же приём, но для обязательной связи (без null-ветки).
export async function resolveOptionalEntityById<T extends { id: number }>(
  id: number | null | undefined,
  findById: (id: number) => Promise<T | null>,
  label: string,
): Promise<T | null> {
  if (id === null || id === undefined) return null;

  const found = await findById(id);
  if (!found) {
    // "не существует", не "не найден(а)" — label общий для меток разного рода (Обложка ж.р.,
    // Тег м.р. и т.п.), а "существует" не требует согласования.
    throw new BadRequestException(`${label} с ID ${id} не существует`);
  }
  return found;
}
