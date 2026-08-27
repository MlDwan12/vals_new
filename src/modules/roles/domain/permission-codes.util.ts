import {
  isPermissionCode,
  PermissionCode,
} from '../../../core/permissions/permission.registry';
import { Permission } from './permission.entity';

// Общий конвертер Permission[] (сущности) -> Set<PermissionCode> — используется и RolesService
// (своя роль), и UsersService (назначаемая роль), раньше был в двух независимых копиях.
export function permissionCodesOf(
  permissions: Permission[],
): Set<PermissionCode> {
  return new Set(
    permissions.map((permission) => permission.code).filter(isPermissionCode),
  );
}
