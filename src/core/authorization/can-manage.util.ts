import { PermissionCode } from '../permissions/permission.registry';

export interface ManageActor {
  rank: number;
  // is_system — байпас любой проверки прав (EXPANSION_TASKS.md §1.1), распространяется и на эти
  // предикаты: держатель системной роли уже проходит любой @Perm()-гейт в AuthGuard, поэтому было
  // бы противоречиво дополнительно блокировать его здесь тем же самым набором прав, который он и
  // так обходит выше по стеку.
  isSystem: boolean;
  permissions: ReadonlySet<PermissionCode>;
}

export interface ManageTargetUser {
  rank: number;
  // Симметрично с ManageTargetRole.isSystem (см. её комментарий) — без отдельной проверки
  // не-системный актёр с рангом не ниже цели мог бы отключить/переназначить/сбросить пароль
  // пользователя с системной ролью, если бы у той роли когда-либо оказался не максимальный ранг
  // (найдено /security-review — та же асимметрия, что уже закрыта в canAssignRole).
  isSystem: boolean;
}

export interface ManageTargetRole {
  rank: number;
  // Системная роль обычно держит ПУСТОЙ набор прав (байпас делает role_permissions ненужным —
  // см. сид разработчика в AddRolesAndPermissions), поэтому проверки rank/permissions ниже сами по
  // себе её не ловят: пустой набор — подмножество чего угодно. Без отдельной проверки
  // canAssignRole пропустил бы не-системного актёра, назначающего системную роль другому
  // пользователю, как только у неё оказался бы ранг не выше его собственного (найдено при
  // независимом altitude-ревью этой же задачи).
  isSystem: boolean;
  permissions: ReadonlySet<PermissionCode>;
}

// EXPANSION_TASKS.md §1.5 — "не выше по рангу", не "строго ниже": иначе скомпрометированную
// учётку верхнего уровня не отключит никто (актёр того же ранга, что и цель, всё ещё может ей
// управлять).
export function canManageTargetUser(
  actor: ManageActor,
  target: ManageTargetUser,
): boolean {
  if (actor.isSystem) return true;
  if (target.isSystem) return false;
  return target.rank <= actor.rank;
}

// Три независимых барьера (§1.3 + §1.1): не-системный актёр не может назначить системную роль
// (иначе он выдал бы кому-то байпас, которого нет у него самого — см. комментарий у
// ManageTargetRole.isSystem); ранг назначаемой роли не выше собственного; в ней нет права,
// которого нет у актёра самого.
export function canAssignRole(
  actor: ManageActor,
  role: ManageTargetRole,
): boolean {
  if (actor.isSystem) return true;
  if (role.isSystem) return false;
  if (role.rank > actor.rank) return false;
  for (const code of role.permissions) {
    if (!actor.permissions.has(code)) return false;
  }
  return true;
}
