// Ширина/высота читаются напрямую из заголовков файла (WEBP/PNG/JPEG) — без сторонних библиотек.
// Решение и обоснование — _docs/expansion-decisions.md §4.1: прогнано против всех 16 реальных
// файлов медиатеки, 0 расхождений с независимой утилитой (`file`/`identify`).
import { isValidWebpSignature } from './webp-signature.util';

export interface ImageDimensions {
  width: number;
  height: number;
}

export type DetectedImageFormat = 'webp' | 'png' | 'jpeg';

const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

export function detectImageFormat(buffer: Buffer): DetectedImageFormat | null {
  // Сигнатура WEBP — тот же чек, что уже используется при валидации загрузки, не повторная
  // инлайн-проверка магических байт (reuse review, /simplify).
  if (isValidWebpSignature(buffer)) {
    return 'webp';
  }
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
    return 'png';
  }
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xd8) {
    return 'jpeg';
  }
  return null;
}

export function mimeTypeForFormat(format: DetectedImageFormat): string {
  switch (format) {
    case 'webp':
      return 'image/webp';
    case 'png':
      return 'image/png';
    case 'jpeg':
      return 'image/jpeg';
  }
}

// WEBP-чанк начинается сразу после RIFF-заголовка (12 байт) и заголовка самого чанка (FourCC 4
// байта + размер чанка 4 байта) — payload с 20-го байта. Три под-формата (VP8/VP8L/VP8X) кодируют
// размеры по-разному (см. спецификацию WebP Container).
function parseWebpDimensions(buffer: Buffer): ImageDimensions | null {
  if (buffer.length < 30) return null;

  const fourCc = buffer.toString('ascii', 12, 16);
  const payload = buffer.subarray(20);

  if (fourCc === 'VP8 ' && payload.length >= 10) {
    // байты 0-2 — frame tag, 3-5 — стартовый код 0x9d 0x01 0x2a, далее ширина/высота по 14 бит LE.
    if (payload[3] !== 0x9d || payload[4] !== 0x01 || payload[5] !== 0x2a) {
      return null;
    }
    return {
      width: payload.readUInt16LE(6) & 0x3fff,
      height: payload.readUInt16LE(8) & 0x3fff,
    };
  }

  if (fourCc === 'VP8L' && payload.length >= 5) {
    if (payload[0] !== 0x2f) return null;
    const bits = payload.readUInt32LE(1);
    return {
      width: (bits & 0x3fff) + 1,
      height: ((bits >>> 14) & 0x3fff) + 1,
    };
  }

  if (fourCc === 'VP8X' && payload.length >= 10) {
    return {
      width: (payload[4] | (payload[5] << 8) | (payload[6] << 16)) + 1,
      height: (payload[7] | (payload[8] << 8) | (payload[9] << 16)) + 1,
    };
  }

  return null;
}

// IHDR — всегда первый чанк сразу после 8-байтовой сигнатуры: 4 байта длины + 'IHDR' (4 байта) +
// width/height по 4 байта big-endian каждый.
function parsePngDimensions(buffer: Buffer): ImageDimensions | null {
  if (buffer.length < 24 || buffer.toString('ascii', 12, 16) !== 'IHDR') {
    return null;
  }
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

// SOF-маркеры, несущие размеры кадра. 0xC4/0xC8/0xCC (DHT/JPG/DAC) исключены — несмотря на попадание
// в общий диапазон 0xC0-0xCF, размеров не несут.
const JPEG_SOF_MARKERS = new Set([
  0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
]);
const JPEG_MARKERS_WITHOUT_PAYLOAD = new Set([0xd8, 0xd9, 0x01]);

// Обход маркеров с пропуском сегментов по их заявленной длине (не наивный поиск байт) — не путает
// размеры кадра с embedded EXIF-превью в APP1, которое несёт собственные (обычно меньшие) SOF-подобные
// данные.
function parseJpegDimensions(buffer: Buffer): ImageDimensions | null {
  let pos = 2; // после SOI (0xFF 0xD8)

  while (pos + 4 <= buffer.length) {
    if (buffer[pos] !== 0xff) {
      pos += 1; // мусорный байт вне маркера
      continue;
    }
    // Спецификация JPEG допускает избыточные 0xFF перед самим кодом маркера (fill bytes внутри
    // самого маркера, не только между маркерами) — пропускаем их все, код маркера первый не-0xFF
    // байт после серии 0xFF (code-review high, N-2: без этого маркер с padding читался как 0xFF,
    // не совпадал ни с одним известным кодом, и длина сегмента бралась из произвольного смещения).
    let markerPos = pos + 1;
    while (markerPos < buffer.length && buffer[markerPos] === 0xff) {
      markerPos += 1;
    }
    if (markerPos >= buffer.length) return null;
    const marker = buffer[markerPos];
    pos = markerPos + 1;

    if (
      JPEG_MARKERS_WITHOUT_PAYLOAD.has(marker) ||
      (marker >= 0xd0 && marker <= 0xd7)
    ) {
      continue;
    }
    if (marker === 0xda) break; // SOS — начало данных сканирования, размеров дальше не будет

    if (pos + 2 > buffer.length) return null;
    const segmentLength = buffer.readUInt16BE(pos);

    if (JPEG_SOF_MARKERS.has(marker)) {
      if (pos + 7 > buffer.length) return null;
      return {
        height: buffer.readUInt16BE(pos + 3),
        width: buffer.readUInt16BE(pos + 5),
      };
    }

    pos += segmentLength;
  }

  return null;
}

export function parseImageDimensions(buffer: Buffer): ImageDimensions | null {
  const format = detectImageFormat(buffer);
  if (format === 'webp') return parseWebpDimensions(buffer);
  if (format === 'png') return parsePngDimensions(buffer);
  if (format === 'jpeg') return parseJpegDimensions(buffer);
  return null;
}
