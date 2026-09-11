import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PinoLogger } from 'nestjs-pino';
import {
  canAssignRole,
  canManageTargetUser,
} from '../../../core/authorization/can-manage.util';
import {
  buildPaginatedResult,
  PaginatedResult,
} from '../../../core/pagination/paginated-result.interface';
import { isUniqueViolation } from '../../../core/persistence/postgres-error.util';
import { AuthenticatedRequestUser } from '../../../core/guards/auth.guard';
import { permissionCodesOf } from '../../roles/domain/permission-codes.util';
import { Role } from '../../roles/domain/role.entity';
import { RoleResponseDto } from '../../roles/dto/role-response.dto';
import { RolesRepository } from '../../roles/infrastructure/roles.repository';
import { ChangeUserRoleDto } from '../dto/change-user-role.dto';
import { CreateUserWithRoleDto } from '../dto/create-user-with-role.dto';
import { ResetPasswordDto } from '../dto/reset-password.dto';
import { SetAccessExpiryDto } from '../dto/set-access-expiry.dto';
import { UpdateUserDto } from '../dto/update-user.dto';
import { UserResponseDto } from '../dto/user-response.dto';
import { User } from '../domain/user.entity';
import { SystemRoleGuardedResult } from '../infrastructure/users.repository';
import { UsersRepository } from '../infrastructure/users.repository';

const BCRYPT_COST = 12;

type UserPatch = Partial<
  Pick<
    User,
    'username' | 'password' | 'isActive' | 'roleId' | 'accessExpiresAt'
  >
>;

@Injectable()
export class UsersService {
  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly rolesRepository: RolesRepository,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(UsersService.name);
  }

  findForAuth(username: string): Promise<User | null> {
    return this.usersRepository.findByUsernameForAuth(
      normalizeUsername(username),
    );
  }

  // Единственный источник маппинга в DTO — контроллер раньше вызывал UserResponseDto.fromEntity()
  // сам (единственное исключение из паттерна проекта среди ~18 admin/public контроллеров, где DTO
  // всегда собирает сервис).
  async findById(id: number): Promise<UserResponseDto> {
    return UserResponseDto.fromEntity(await this.findEntityById(id));
  }

  async paginate(
    page: number,
    limit: number,
  ): Promise<PaginatedResult<UserResponseDto>> {
    const [items, total] = await this.usersRepository.findAndCount(page, limit);
    return buildPaginatedResult(
      items.map((user) => UserResponseDto.fromEntity(user)),
      total,
      page,
      limit,
    );
  }

  // Роли, которые актёр вправе назначить — тем же предикатом, которым changeRole/createWithRoleId
  // потом проверят выбор (canAssignRole). Своя ручка в users, а не переиспользование
  // /admin/roles: тот список закрыт правом roles.manage, а выбрать роль сотруднику должен уметь
  // и держатель одного users.manage — иначе смена роли из панели невозможна без права управлять
  // ролями. Отфильтрованный список безопаснее полного и по содержимому: в нём только роли, все
  // права которых у актёра и так есть.
  async findAssignableRoles(
    actor: AuthenticatedRequestUser,
  ): Promise<RoleResponseDto[]> {
    const roles = await this.rolesRepository.findAll();
    return roles
      .filter((role) =>
        canAssignRole(actor, {
          rank: role.rank,
          isSystem: role.isSystem,
          permissions: permissionCodesOf(role.permissions),
        }),
      )
      .map((role) => RoleResponseDto.fromEntity(role));
  }

  async findExpiring(days: number): Promise<UserResponseDto[]> {
    const users = await this.usersRepository.findExpiringWithinDays(days);
    return users.map((user) => UserResponseDto.fromEntity(user));
  }

  private async findEntityById(id: number): Promise<User> {
    const user = await this.usersRepository.findById(id);
    if (!user) {
      throw new NotFoundException('Пользователь не найден');
    }
    return user;
  }

  // Единственный путь создания пользователя: под любую роль, включая заведённые из панели
  // (EXPANSION_TASKS.md §1). Три легаси-метода под фиксированные роли удалены в срезе A.4 —
  // они обходили canAssignRole.
  async createWithRoleId(
    actor: AuthenticatedRequestUser,
    dto: CreateUserWithRoleDto,
  ): Promise<void> {
    const role = await this.resolveRoleOrFail(dto.roleId);
    this.assertCanAssignRole(actor, role);
    await this.createInternal(
      dto.username,
      dto.password,
      role.id,
      dto.accessExpiresAt ? new Date(dto.accessExpiresAt) : null,
    );
  }

  private async createInternal(
    username: string,
    password: string,
    roleId: number,
    accessExpiresAt: Date | null,
  ): Promise<void> {
    const normalizedUsername = normalizeUsername(username);

    const existing =
      await this.usersRepository.findByUsername(normalizedUsername);
    if (existing) {
      throw new ConflictException('Пользователь с таким именем уже существует');
    }

    const passwordHash = await this.hashPassword(password);

    try {
      await this.usersRepository.create({
        username: normalizedUsername,
        password: passwordHash,
        roleId,
        accessExpiresAt,
      });
    } catch (error: unknown) {
      if (isUniqueViolation(error)) {
        throw new ConflictException(
          'Пользователь с таким именем уже существует',
        );
      }
      this.logger.error(
        { err: error, username: normalizedUsername, roleId },
        'Failed to save user',
      );
      throw new InternalServerErrorException('Не удалось создать пользователя');
    }
  }

  async changeRole(
    actor: AuthenticatedRequestUser,
    id: number,
    dto: ChangeUserRoleDto,
  ): Promise<UserResponseDto> {
    const user = await this.findEntityById(id);
    this.assertCanManageTargetUser(actor, user.role);
    const newRole = await this.resolveRoleOrFail(dto.roleId);
    this.assertCanAssignRole(actor, newRole);

    return this.applyGuardedPatch(id, { roleId: newRole.id });
  }

  async setAccessExpiry(
    actor: AuthenticatedRequestUser,
    id: number,
    dto: SetAccessExpiryDto,
  ): Promise<UserResponseDto> {
    const user = await this.findEntityById(id);
    this.assertCanManageTargetUser(actor, user.role);

    // Снятие срока (null) не угрожает headcount системных ролей — защищать нужно только
    // УСТАНОВКУ срока (EXPANSION_TASKS.md §1.6: "ограничить сроком" последнего активного).
    if (!dto.accessExpiresAt) {
      const updated = await this.usersRepository.update(id, {
        accessExpiresAt: null,
      });
      if (!updated) throw new NotFoundException('Пользователь не найден');
      return UserResponseDto.fromEntity(updated);
    }

    return this.applyGuardedPatch(id, {
      accessExpiresAt: new Date(dto.accessExpiresAt),
    });
  }

  // Отдельное право от users.manage (EXPANSION_TASKS.md §1.6) — @Perm(USERS_RESET_PASSWORD)
  // проверяется декоратором на роуте, но этого недостаточно самого по себе: без rank-проверки
  // здесь держатель этого права мог бы сбросить пароль ЛЮБОГО пользователя, включая того, кто выше
  // по рангу или системный — де-факто получить его личность (найдено /code-review high, реальный
  // privilege escalation — та же проверка, что у changeRole/setAccessExpiry, здесь отсутствовала).
  async resetPassword(
    actor: AuthenticatedRequestUser,
    id: number,
    dto: ResetPasswordDto,
  ): Promise<void> {
    const user = await this.findEntityById(id);
    this.assertCanManageTargetUser(actor, user.role);
    const passwordHash = await this.hashPassword(dto.password);
    await this.usersRepository.update(id, { password: passwordHash });
  }

  // actor обязателен — без rank/is_system-проверки это была бы единственная мутирующая ручка в
  // модуле без ограничения на цель, хотя update()/remove() работают с произвольным id пользователя
  // точно так же, как changeRole/setAccessExpiry/resetPassword (найдено /code-review high:
  // легаси-гейт @Roles(Role.DEVELOPER) на роуте сам по себе не гарантия — RolesService.update()
  // осознанно позволяет понизить ранг/снять is_system у самой роли developer, поэтому "код роли ==
  // вершина иерархии" не структурный инвариант, actor.rank/isSystem нужно перепроверять живьём).
  async update(
    actor: AuthenticatedRequestUser,
    id: number,
    dto: UpdateUserDto,
  ): Promise<UserResponseDto> {
    const user = await this.findEntityById(id);
    this.assertCanManageTargetUser(actor, user.role);

    const patch: UserPatch = {};
    if (dto.username !== undefined) {
      patch.username = normalizeUsername(dto.username);
    }
    if (dto.password !== undefined) {
      patch.password = await this.hashPassword(dto.password);
    }
    if (dto.isActive !== undefined) {
      patch.isActive = dto.isActive;
    }

    try {
      if (patch.isActive === false) {
        return await this.applyGuardedPatch(id, patch);
      }
      const updated = await this.usersRepository.update(id, patch);
      if (!updated) {
        throw new NotFoundException('Пользователь не найден');
      }
      return UserResponseDto.fromEntity(updated);
    } catch (error: unknown) {
      if (isUniqueViolation(error)) {
        throw new ConflictException(
          'Пользователь с таким именем уже существует',
        );
      }
      throw error;
    }
  }

  async remove(actor: AuthenticatedRequestUser, id: number): Promise<void> {
    const user = await this.findEntityById(id);
    this.assertCanManageTargetUser(actor, user.role);
    const result = await this.usersRepository.runGuardedBySystemRoleHeadcount(
      id,
      async (manager) => {
        await manager.delete(User, id);
      },
    );
    this.assertGuardResult(result);
  }

  // Общий хвост для мутаций, которые МОГУТ вывести пользователя из пула активных системных
  // (смена роли, ограничение сроком, отключение) — раньше было по три копии одной и той же
  // цепочки "лок-гвард -> assertGuardResult -> перечитать -> смаппить в DTO" в changeRole/
  // setAccessExpiry/update (найдено simplification-ревью этой же задачи). remove() сюда не
  // попадает — ей нужен manager.delete(), а не manager.update() с патчем.
  private async applyGuardedPatch(
    id: number,
    patch: UserPatch,
  ): Promise<UserResponseDto> {
    const result = await this.usersRepository.runGuardedBySystemRoleHeadcount(
      id,
      async (manager) => {
        await manager.update(User, id, patch);
      },
    );
    this.assertGuardResult(result);
    return UserResponseDto.fromEntity(await this.findEntityById(id));
  }

  private assertGuardResult(result: SystemRoleGuardedResult): void {
    if (result === 'not_found') {
      throw new NotFoundException('Пользователь не найден');
    }
    if (result === 'blocked') {
      throw new BadRequestException(
        'Нельзя отключить, удалить, понизить или ограничить сроком последнего активного ' +
          'пользователя с системной ролью',
      );
    }
  }

  // Actor/targetRole передаются в предикаты напрямую — AuthenticatedRequestUser и Role уже
  // структурно satisfies ManageActor/ManageTargetUser, обёртка не нужна (найдено
  // simplification-ревью этой же задачи).
  private assertCanManageTargetUser(
    actor: AuthenticatedRequestUser,
    targetRole: Role,
  ): void {
    if (!canManageTargetUser(actor, targetRole)) {
      throw new ForbiddenException(
        'Нельзя управлять пользователем с ролью выше своей',
      );
    }
  }

  private assertCanAssignRole(
    actor: AuthenticatedRequestUser,
    role: Role,
  ): void {
    const allowed = canAssignRole(actor, {
      rank: role.rank,
      isSystem: role.isSystem,
      permissions: permissionCodesOf(role.permissions),
    });
    if (!allowed) {
      throw new ForbiddenException(
        'Нельзя назначить роль выше своего ранга или с правом, которого нет у вас самих',
      );
    }
  }

  private async resolveRoleOrFail(roleId: number): Promise<Role> {
    const role = await this.rolesRepository.findById(roleId);
    if (!role) {
      throw new BadRequestException(`Роль с ID ${roleId} не найдена`);
    }
    return role;
  }

  private async hashPassword(password: string): Promise<string> {
    try {
      return await bcrypt.hash(password, BCRYPT_COST);
    } catch (error: unknown) {
      this.logger.error({ err: error }, 'Failed to hash user password');
      throw new InternalServerErrorException(
        'Не удалось обработать пароль пользователя',
      );
    }
  }
}

// Логин нормализуется одинаково при создании и обновлении (ТЗ §5) — раньше нормализация
// была только при создании, из-за чего переименование ломало вход.
function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}
