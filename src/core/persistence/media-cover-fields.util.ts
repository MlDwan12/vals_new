// Лёгкая проекция обложки для джойна к статье/кейсу в списочных запросах (mainInfoQuery) — та же
// идея, что AUTHOR_SHORT_FIELDS/TAG_SHORT_FIELDS в author-tag-relation-filters.util.ts, но без
// фильтра по ней (обложка не фильтруется, только отображается).
export const MEDIA_COVER_SHORT_FIELDS = [
  'cover.id',
  'cover.fileName',
  'cover.alt',
  'cover.width',
  'cover.height',
];
