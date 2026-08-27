import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PermissionCode } from '../../../core/permissions/permission.registry';
import { permissionCodesOf } from '../../roles/domain/permission-codes.util';
import { UsersRepository } from '../infrastructure/users.repository';

export interface RequestAuthContext {
  sub: number;
  username: string;
  role: string;
  rank: number;
  isSystem: boolean;
  permissions: ReadonlySet<PermissionCode>;
}

// Вызывается AuthGuard на каждый защищённый запрос (EXPANSION_TASKS.md §1.4) — роль/права/isActive/
// access_expires_at читаются живьём из БД, не из JWT, поэтому отключение/смена роли/истечение
// доступа действуют на следующем же запросе, а не спустя ACCESS_TOKEN_TTL_SECONDS. Единое сообщение
// на все три причины отказа здесь — троекратно различное сообщение нужно только на /auth/login
// (AuthService.validateUser), не на каждый последующий запрос уже вошедшего пользователя.
@Injectable()
export class AuthContextService {
  constructor(private readonly usersRepository: UsersRepository) {}

  async resolveRequestUser(userId: number): Promise<RequestAuthContext> {
    const user = await this.usersRepository.findAuthContextById(userId);

    if (
      !user ||
      !user.isActive ||
      (user.accessExpiresAt !== null &&
        user.accessExpiresAt.getTime() <= Date.now())
    ) {
      throw new UnauthorizedException('Требуется авторизация');
    }

    return {
      sub: user.id,
      username: user.username,
      role: user.role.code,
      rank: user.role.rank,
      isSystem: user.role.isSystem,
      permissions: permissionCodesOf(user.role.permissions),
    };
  }
}
