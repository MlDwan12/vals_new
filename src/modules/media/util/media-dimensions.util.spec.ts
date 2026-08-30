import {
  detectImageFormat,
  parseImageDimensions,
} from './media-dimensions.util';

// Фикстуры — первые байты (только заголовок, без пиксельных данных) реальных файлов медиатеки
// проекта на момент задачи 4, ожидаемые размеры сверены независимо через `file`/`identify`
// (см. _docs/expansion-decisions.md §4.1). Три под-формата WEBP (VP8/VP8L/VP8X) — все три реально
// встречаются в медиатеке, не только гипотетически.
const VP8_WEBP_HEADER = Buffer.from(
  '52494646a0ab0000574542505650382094ab0000d0b4039d012a7c08d4023e9d4ca04d262b2b2f21',
  'hex',
); // ec347e18-...webp → 2172x724

const VP8L_WEBP_HEADER = Buffer.from(
  '524946466e0c0100574542505650384c610c01002f81025d008d486c1b49922428f77ea6ff0e5775',
  'hex',
); // 0df18db2-...webp → 642x373

const VP8X_WEBP_HEADER = Buffer.from(
  '52494646ce30020057454250565038580a00000020000000ff0500ff030049434350c80100000000',
  'hex',
); // a750556f-...webp → 1536x1024

const PNG_HEADER = Buffer.from(
  '89504e470d0a1a0a0000000d494844520000035e0000021408030000003db20d7e000002fd504c54',
  'hex',
); // a65a4946-...png → 862x532

const JPEG_HEADER = Buffer.from(
  'ffd8ffe000104a46494600010100000100010000ffdb00840003020208080808080808080808080808080808080a0808080808080808080808080808080808080808080808080a080808080a0a0a08080b0d0a080d08080a08010304040605060a06060a0d0d0a0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0dffc00011080152020003011100021101031101ffc4001d000001',
  'hex',
); // 2fc06d0e-...jpg → 512x338 (SOF0 после APP0/DQT — не наивный поиск, а обход маркеров по длине)

describe('detectImageFormat', () => {
  it('распознаёт WEBP по контейнеру RIFF/WEBP', () => {
    expect(detectImageFormat(VP8_WEBP_HEADER)).toBe('webp');
  });

  it('распознаёт PNG по сигнатуре', () => {
    expect(detectImageFormat(PNG_HEADER)).toBe('png');
  });

  it('распознаёт JPEG по SOI-маркеру', () => {
    expect(detectImageFormat(JPEG_HEADER)).toBe('jpeg');
  });

  it('неизвестный формат — null', () => {
    expect(detectImageFormat(Buffer.from('не картинка', 'utf8'))).toBeNull();
  });

  it('слишком короткий буфер — null, не падение', () => {
    expect(detectImageFormat(Buffer.from([0xff]))).toBeNull();
  });
});

describe('parseImageDimensions', () => {
  it('WEBP VP8 (lossy)', () => {
    expect(parseImageDimensions(VP8_WEBP_HEADER)).toEqual({
      width: 2172,
      height: 724,
    });
  });

  it('WEBP VP8L (lossless)', () => {
    expect(parseImageDimensions(VP8L_WEBP_HEADER)).toEqual({
      width: 642,
      height: 373,
    });
  });

  it('WEBP VP8X (extended — альфа/метаданные)', () => {
    expect(parseImageDimensions(VP8X_WEBP_HEADER)).toEqual({
      width: 1536,
      height: 1024,
    });
  });

  it('PNG — размеры из IHDR', () => {
    expect(parseImageDimensions(PNG_HEADER)).toEqual({
      width: 862,
      height: 532,
    });
  });

  it('JPEG — SOF0 после APP0/DQT (обход по длине сегмента, не наивный поиск)', () => {
    expect(parseImageDimensions(JPEG_HEADER)).toEqual({
      width: 512,
      height: 338,
    });
  });

  it('JPEG с избыточными 0xFF (fill bytes) перед кодом маркера — не путает маркер (code-review high N-2)', () => {
    // Спецификация JPEG допускает 0xFF FF ... FF <код> — вставляем лишний 0xFF прямо перед SOF0
    // (маркер 0xC0) в реальном заголовке: без пропуска fill bytes код маркера читался бы как 0xFF.
    const sofMarkerOffset = JPEG_HEADER.indexOf(Buffer.from([0xff, 0xc0]));
    expect(sofMarkerOffset).toBeGreaterThan(0);
    const withPadding = Buffer.concat([
      JPEG_HEADER.subarray(0, sofMarkerOffset),
      Buffer.from([0xff]),
      JPEG_HEADER.subarray(sofMarkerOffset),
    ]);
    expect(parseImageDimensions(withPadding)).toEqual({
      width: 512,
      height: 338,
    });
  });

  it('невалидный/неизвестный файл — null, не исключение', () => {
    expect(
      parseImageDimensions(Buffer.from('garbage bytes here', 'utf8')),
    ).toBeNull();
  });

  it('обрезанный WEBP-заголовок (меньше 30 байт) — null', () => {
    expect(parseImageDimensions(VP8_WEBP_HEADER.subarray(0, 20))).toBeNull();
  });
});
