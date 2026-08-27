import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuthenticatedRequestUser } from '../../../core/guards/auth.guard';
import { canAssignRole } from '../../../core/authorization/can-manage.util';
import {
  isForeignKeyViolation,
  isUniqueViolation,
} from '../../../core/persistence/postgres-error.util';
import {
  PERMISSIONS,
  PermissionCode,
} from '../../../core/permissions/permission.registry';
import { resolveOptionalEntitiesByIds } from '../../../core/persistence/resolve-entities-by-ids.util';
import { permissionCodesOf } from '../domain/permission-codes.util';
import { Role } from '../domain/role.entity';
import { CreateRoleDto } from '../dto/create-role.dto';
import { PermissionResponseDto } from '../dto/permission-response.dto';
import { RoleResponseDto } from '../dto/role-response.dto';
import { UpdateRoleDto } from '../dto/update-role.dto';
import { PermissionsRepository } from '../infrastructure/permissions.repository';
import { RolesRepository } from '../infrastructure/roles.repository';

@Injectable()
export class RolesService {
  constructor(
    private readonly rolesRepository: RolesRepository,
    private readonly permissionsRepository: PermissionsRepository,
  ) {}

  async findAll(): Promise<RoleResponseDto[]> {
    const roles = await this.rolesRepository.findAll();
    return roles.map((role) => RoleResponseDto.fromEntity(role));
  }

  async findById(id: number): Promise<RoleResponseDto> {
    return RoleResponseDto.fromEntity(await this.findEntityByIdOrFail(id));
  }

  // Реестр прав сидится миграцией, из панели не редактируется (EXPANSION_TASKS.md §1.2) — только
  // чтение, для списка чекбоксов при создании/правке роли. Контроллер идёт через сервис, а не
  // PermissionsRepository напрямую (CLAUDE.md §3 — найдено /code-review high).
  async findAllPermissions(): Promise<PermissionResponseDto[]> {
    const permissions = await this.permissionsRepository.findAll();
    return permissions.map((permission) =>
      PermissionResponseDto.fromEntity(permission),
    );
  }

  async create(
    actor: AuthenticatedRequestUser,
    dto: CreateRoleDto,
  ): Promise<RoleResponseDto> {
    const isSystem = dto.isSystem ?? false;
    // Минтить новую системную роль может только тот, кто сам держит системную роль — тот же
    // принцип, что и в canAssignRole (назначение уже существующей системной роли пользователю):
    // без явного сообщения здесь актёр получил бы то же самое отклонение через assertCanAssign
    // ниже, но с менее точной причиной.
    if (isSystem && !actor.isSystem) {
      throw new ForbiddenException(
        'Только держатель системной роли может создать новую системную роль',
      );
    }

    const permissions = await resolveOptionalEntitiesByIds(
      dto.permissionIds,
      (ids) => this.permissionsRepository.findByIds(ids),
      'Права',
    );

    this.assertCanAssign(
      actor,
      dto.rank,
      isSystem,
      permissionCodesOf(permissions),
    );

    const role = this.rolesRepository.create({
      code: dto.code,
      title: dto.title,
      description: dto.description ?? null,
      rank: dto.rank,
      isSystem,
      permissions,
    });

    return this.saveAndReturn(role);
  }

  async update(
    actor: AuthenticatedRequestUser,
    id: number,
    dto: UpdateRoleDto,
  ): Promise<RoleResponseDto> {
    const role = await this.findEntityByIdOrFail(id);

    const resultingRank = dto.rank ?? role.rank;
    const resultingIsSystem =
      dto.isSystem !== undefined ? dto.isSystem : role.isSystem;
    const resultingPermissions =
      dto.permissionIds !== undefined
        ? await resolveOptionalEntitiesByIds(
            dto.permissionIds,
            (ids) => this.permissionsRepository.findByIds(ids),
            'Права',
          )
        : role.permissions;
    const resultingPermissionCodes = permissionCodesOf(resultingPermissions);

    if (resultingIsSystem !== role.isSystem && !actor.isSystem) {
      throw new ForbiddenException(
        'Только держатель системной роли может менять её системный статус',
      );
    }

    // Снятие is_system — единственный момент, когда байпас реально исчезает (EXPANSION_TASKS.md
    // §1.4): без явных users.manage/roles.manage в самой роли все её держатели мгновенно теряют
    // доступ без предупреждения. Правка чекбоксов у роли, ОСТАЮЩЕЙСЯ системной, безопасна — байпас
    // всё равно даёт доступ независимо от role_permissions.
    if (role.isSystem && !resultingIsSystem) {
      const keepsAccess =
        resultingPermissionCodes.has(PERMISSIONS.USERS_MANAGE) &&
        resultingPermissionCodes.has(PERMISSIONS.ROLES_MANAGE);
      if (!keepsAccess) {
        throw new BadRequestException(
          'Нельзя снять системный статус: у роли нет явных прав users.manage и roles.manage — ' +
            'сначала выдайте их явно, потом снимайте системный статус',
        );
      }
    }

    this.assertCanAssign(
      actor,
      resultingRank,
      resultingIsSystem,
      resultingPermissionCodes,
    );

    role.code = dto.code ?? role.code;
    role.title = dto.title ?? role.title;
    if ('description' in dto) role.description = dto.description ?? null;
    role.rank = resultingRank;
    role.isSystem = resultingIsSystem;
    role.permissions = resultingPermissions;

    return this.saveAndReturn(role);
  }

  // users.role_id -> RESTRICT (user.entity.ts) — удаление роли с живыми пользователями падает
  // FK-нарушением до единой строчки бизнес-логики здесь (EXPANSION_TASKS.md §1.4). Отдельно —
  // rank/is_system-проверка ДО удаления: без неё не-системный актёр с одним лишь roles.manage мог
  // удалить (не создать/изменить/назначить, а безвозвратно уничтожить) роль выше своего ранга или
  // системную, как только та осталась без единого держателя (найдено /code-review high —
  // create()/update() эту роль проверяют тем же предикатом, remove() — нет).
  async remove(actor: AuthenticatedRequestUser, id: number): Promise<void> {
    const role = await this.findEntityByIdOrFail(id);
    this.assertCanAssign(
      actor,
      role.rank,
      role.isSystem,
      permissionCodesOf(role.permissions),
    );
    try {
      await this.rolesRepository.remove(id);
    } catch (error) {
      if (isForeignKeyViolation(error)) {
        throw new BadRequestException(
          'Нельзя удалить роль — она используется хотя бы одним пользователем',
        );
      }
      throw error;
    }
  }

  // save() возвращает ту же сущность с уже проставленными permissions (мы сами их туда положили
  // перед вызовом) плюс сгенерированные/обновлённые колонки — повторный SELECT не добавляет
  // информации (найдено efficiency-ревью этой же задачи).
  private async saveAndReturn(role: Role): Promise<RoleResponseDto> {
    try {
      const saved = await this.rolesRepository.save(role);
      return RoleResponseDto.fromEntity(saved);
    } catch (error) {
      if (isForeignKeyViolation(error)) throw error;
      throw this.mapCodeConflict(error);
    }
  }

  // §1.1 + §1.3 — три барьера сразу: не-системный актёр не может создать/сохранить системную
  // роль (canAssignRole сам это проверяет — см. её комментарий), ранг не выше собственного, и в
  // итоговом наборе прав роли нет ничего, чего нет у самого актёра. Актёр передаётся в
  // canAssignRole напрямую — AuthenticatedRequestUser уже структурно satisfies ManageActor,
  // обёртка не нужна.
  private assertCanAssign(
    actor: AuthenticatedRequestUser,
    rank: number,
    isSystem: boolean,
    permissionCodes: Set<PermissionCode>,
  ): void {
    if (
      !canAssignRole(actor, { rank, isSystem, permissions: permissionCodes })
    ) {
      throw new ForbiddenException(
        'Нельзя сохранить роль с рангом выше своего или с правом, которого нет у вас самих',
      );
    }
  }

  private mapCodeConflict(error: unknown): unknown {
    if (isUniqueViolation(error)) {
      return new ConflictException('Роль с таким code уже существует');
    }
    return error;
  }

  private async findEntityByIdOrFail(id: number): Promise<Role> {
    const role = await this.rolesRepository.findById(id);
    if (!role) {
      throw new NotFoundException(`Роль с ID ${id} не найдена`);
    }
    return role;
  }
}
