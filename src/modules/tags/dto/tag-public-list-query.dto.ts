import { IsIn, IsOptional } from 'class-validator';

// Типы контента, у которых есть теги. Значения совпадают с сегментом публичного адреса раздела
// (/articles, /cases, /news) — фронт передаёт их как ?type= и больше ничего о них знать не должен.
export const TAG_CONTENT_TYPES = ['article', 'case', 'news'] as const;

export type TagContentType = (typeof TAG_CONTENT_TYPES)[number];

export class TagPublicListQueryDto {
  // Сузить до тегов, использованных только в статьях / только в кейсах / только в новостях.
  // Без параметра — объединение всех трёх.
  @IsOptional()
  @IsIn([...TAG_CONTENT_TYPES])
  type?: TagContentType;
}
