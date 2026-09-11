import { Role } from './role.enum';

// Последняя легаси-группа: осталась только на трёх старых ручках создания пользователя
// (/admin/users/content-managers|client-managers|admins), где роль фиксирована самим путём.
// ALL_ROLES удалена вместе с @Roles() на дашборде (срез A.1) — «любая аутентифицированная роль»
// теперь выражается отсутствием декоратора, а не перечислением четырёх сидированных кодов.
export const ADMIN_ROLES = [Role.DEVELOPER, Role.ADMIN] as const;
