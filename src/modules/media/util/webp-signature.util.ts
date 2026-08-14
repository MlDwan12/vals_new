// mimetype приходит от клиента и подделывается (ТЗ §6) — здесь сверяем реальные magic bytes WEBP
// (контейнер RIFF со вложенным форматом WEBP), а не то, что клиент заявил в заголовке.
export function isValidWebpSignature(buffer: Buffer): boolean {
  if (buffer.length < 12) return false;
  return (
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  );
}
