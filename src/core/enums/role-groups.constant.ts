import { Role } from './role.enum';

export const ADMIN_ROLES = [Role.DEVELOPER, Role.ADMIN] as const;

export const CONTENT_ROLES = [
  Role.DEVELOPER,
  Role.ADMIN,
  Role.CONTENT_MANAGER,
] as const;
