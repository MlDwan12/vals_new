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
