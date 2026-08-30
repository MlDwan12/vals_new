// Единая точка правды для публичного пути файла медиатеки — используется в MediaResponseDto и
// MediaCoverDto (reuse review, /simplify: было продублировано literal-строкой в обоих).
export function buildMediaUrl(fileName: string): string {
  return `/uploads/media/${fileName}`;
}
