import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { Role } from '../enums/role.enum';
import { AuthenticatedRequestUser } from './auth.guard';

interface RequestWithUser extends Request {
  // Тип целиком из AuthGuard (не локальное независимое объявление) — role/isSystem уже несут
  // инвариант §1.1 там, дублировать его форму здесь второй раз незачем.
  user?: Pick<AuthenticatedRequestUser, 'role' | 'isSystem'>;
}

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Role[] | undefined>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const requestUser = request.user;

    // is_system — байпас, не зависящий от role_permissions/@Roles() (§1.1, тот же инвариант,
    // что и у @Perm() в AuthGuard) — иначе кастомная системная роль проходит гранулярные права,
    // но упирается в легаси @Roles() на ещё не переведённых роутах (code review, сессия 29,
    // находка №1).
    if (requestUser?.isSystem) {
      return true;
    }

    const userRole = requestUser?.role;

    if (!userRole || !(requiredRoles as string[]).includes(userRole)) {
      throw new ForbiddenException('Недостаточно прав для выполнения операции');
    }

    return true;
  }
}
