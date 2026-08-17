import { Role } from './role.enum';

export const ADMIN_ROLES = [Role.DEVELOPER, Role.ADMIN] as const;

export const CONTENT_ROLES = [
  Role.DEVELOPER,
  Role.ADMIN,
  Role.CONTENT_MANAGER,
] as const;

export const CLIENT_ROLES = [
  Role.DEVELOPER,
  Role.ADMIN,
  Role.CLIENT_MANAGER,
] as const;

// Любая аутентифицированная админская роль — дашборд одинаково доступен всем четырём (ТЗ:
// шире, чем ADMIN_ROLES у аудита).
export const ALL_ROLES = [
  Role.DEVELOPER,
  Role.ADMIN,
  Role.CONTENT_MANAGER,
  Role.CLIENT_MANAGER,
] as const;
