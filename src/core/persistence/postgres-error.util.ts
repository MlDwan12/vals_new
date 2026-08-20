import { QueryFailedError } from 'typeorm';

const UNIQUE_VIOLATION = '23505';
const FOREIGN_KEY_VIOLATION = '23503';

function hasPostgresErrorCode(error: unknown, code: string): boolean {
  return (
    error instanceof QueryFailedError &&
    (error as QueryFailedError & { driverError?: { code?: string } })
      .driverError?.code === code
  );
}

export function isUniqueViolation(error: unknown): boolean {
  return hasPostgresErrorCode(error, UNIQUE_VIOLATION);
}

export function isForeignKeyViolation(error: unknown): boolean {
  return hasPostgresErrorCode(error, FOREIGN_KEY_VIOLATION);
}

// Для доменов с более чем одним unique-индексом (round-3 review, tags: slug + name) одного
// isUniqueViolation недостаточно, чтобы сформировать верное сообщение — нужно знать, какой именно
// индекс/constraint нарушен. pg-protocol кладёт его имя в driverError.constraint.
export function getViolatedConstraint(error: unknown): string | undefined {
  if (!(error instanceof QueryFailedError)) return undefined;
  return (error as QueryFailedError & { driverError?: { constraint?: string } })
    .driverError?.constraint;
}
