import { AuthenticatedRequestUser } from '../../../core/guards/auth.guard';
import { PermissionCode } from '../../../core/permissions/permission.registry';

// Ответ /auth/login и /auth/me — на нём строится гейт админки (FULLSTACK_PLAN.md, срез A.1).
// Раньше отдавалось только {username, role}: по одной строке роли фронт не может ни закрыть
// маршрут раздела, ни показать правильное меню, как только роли заводятся из панели и их коды
// заранее неизвестны.
export class AuthProfileDto {
  id: number;
  username: string;
  role: string;
  // Ранг нужен фронту, чтобы не предлагать действия, которые бек всё равно отклонит
  // (can-manage.util.ts: «не выше по рангу») — например правку пользователя старшей роли.
  rank: number;
  // Системная роль проходит любой @Perm() байпасом (EXPANSION_TASKS.md §1.1), а её
  // role_permissions намеренно пусты — по одному permissions владелец увидел бы пустое меню при
  // полном доступе. Гейт обязан читаться как `isSystem || permissions.includes(code)`.
  isSystem: boolean;
  permissions: PermissionCode[];

  // Источник — request.user, который AuthGuard уже прочитал живьём из БД на этот же запрос
  // (AuthContextService): отдельного запроса к БД ради /auth/me не нужно, и профиль гарантированно
  // тот же, по которому только что отработали @Perm()-проверки.
  static fromRequestUser(user: AuthenticatedRequestUser): AuthProfileDto {
    const dto = new AuthProfileDto();
    dto.id = user.sub;
    dto.username = user.username;
    dto.role = user.role;
    dto.rank = user.rank;
    dto.isSystem = user.isSystem;
    // Сортировка — ради стабильного тела ответа (диффы в тестах и в devtools), порядок из
    // role_permissions ничего не значит.
    dto.permissions = [...user.permissions].sort();
    return dto;
  }
}
