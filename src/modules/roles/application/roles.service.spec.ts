import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import { AuthenticatedRequestUser } from '../../../core/guards/auth.guard';
import { PERMISSIONS } from '../../../core/permissions/permission.registry';
import { Permission } from '../domain/permission.entity';
import { Role } from '../domain/role.entity';
import { PermissionsRepository } from '../infrastructure/permissions.repository';
import { RolesRepository } from '../infrastructure/roles.repository';
import { RolesService } from './roles.service';

class FakeDriverError extends Error {
  code?: string;
}

function foreignKeyViolation(): QueryFailedError {
  const driverError = new FakeDriverError('violates foreign key constraint');
  Object.assign(driverError, { code: '23503' });
  return new QueryFailedError('DELETE FROM "roles" ...', [], driverError);
}

function uniqueViolation(): QueryFailedError {
  const driverError = new FakeDriverError('duplicate key value');
  Object.assign(driverError, { code: '23505' });
  return new QueryFailedError('INSERT INTO "roles" ...', [], driverError);
}

function buildActor(
  overrides: Partial<AuthenticatedRequestUser> = {},
): AuthenticatedRequestUser {
  return {
    sub: 1,
    username: 'actor',
    role: 'admin',
    rank: 80,
    isSystem: false,
    permissions: new Set([PERMISSIONS.ROLES_MANAGE, PERMISSIONS.USERS_MANAGE]),
    ...overrides,
  };
}

function buildPermission(code: string, id = 1): Permission {
  return { id, code, title: code, group: code.split('.')[0] };
}

function buildRole(overrides: Partial<Role> = {}): Role {
  return {
    id: 1,
    code: 'content_manager',
    title: 'Контент-менеджер',
    description: null,
    rank: 40,
    isSystem: false,
    permissions: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

// createMock/removeMock — отдельные переменные (@typescript-eslint/unbound-method — тот же приём,
// что в tags.service.spec.ts).
function buildRepositories(): {
  rolesRepo: jest.Mocked<RolesRepository>;
  permissionsRepo: jest.Mocked<PermissionsRepository>;
  saveMock: jest.Mock;
  removeMock: jest.Mock;
  saveGuardedMock: jest.Mock;
} {
  const saveMock = jest.fn((role: Role) =>
    Promise.resolve({ ...role, id: role.id ?? 1 }),
  );
  const removeMock = jest.fn();
  // По умолчанию — как будто держателей у роли нет, барьер не срабатывает (симметрично тому, что
  // UsersRepository.runGuardedBySystemRoleHeadcount возвращает 'ok', когда цель не активный
  // системный держатель) — тесты, которым нужен именно 'blocked', переопределяют явно.
  const saveGuardedMock = jest.fn((role: Role) =>
    Promise.resolve({ ...role, id: role.id ?? 1 }),
  );
  const rolesRepo = {
    findAll: jest.fn(),
    findById: jest.fn(),
    findByIds: jest.fn(),
    findByCode: jest.fn(),
    create: jest.fn((data) => ({ ...data, id: 1 }) as Role),
    save: saveMock,
    remove: removeMock,
    saveGuardedBySystemRoleHeadcount: saveGuardedMock,
  } as unknown as jest.Mocked<RolesRepository>;
  const permissionsRepo = {
    findAll: jest.fn(),
    findByIds: jest.fn().mockResolvedValue([]),
  } as unknown as jest.Mocked<PermissionsRepository>;
  return { rolesRepo, permissionsRepo, saveMock, removeMock, saveGuardedMock };
}

describe('RolesService.create — барьеры §1.3', () => {
  it('запрещает создать системную роль актёру без системной роли', async () => {
    const { rolesRepo, permissionsRepo } = buildRepositories();
    const service = new RolesService(rolesRepo, permissionsRepo);
    const actor = buildActor({ isSystem: false });

    await expect(
      service.create(actor, {
        code: 'sneaky',
        title: 'Sneaky',
        rank: 10,
        isSystem: true,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('разрешает создать системную роль актёру, который сам системный', async () => {
    const { rolesRepo, permissionsRepo } = buildRepositories();
    rolesRepo.findById.mockResolvedValue(buildRole({ isSystem: true }));
    const service = new RolesService(rolesRepo, permissionsRepo);
    const actor = buildActor({ isSystem: true, rank: 100 });

    await expect(
      service.create(actor, {
        code: 'new-system',
        title: 'New system',
        rank: 90,
        isSystem: true,
      }),
    ).resolves.toBeDefined();
  });

  it('запрещает роль с рангом выше своего', async () => {
    const { rolesRepo, permissionsRepo } = buildRepositories();
    const service = new RolesService(rolesRepo, permissionsRepo);
    const actor = buildActor({ rank: 40 });

    await expect(
      service.create(actor, { code: 'high', title: 'High', rank: 80 }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('запрещает право, которого нет у актёра', async () => {
    const { rolesRepo, permissionsRepo } = buildRepositories();
    permissionsRepo.findByIds.mockResolvedValue([
      buildPermission(PERMISSIONS.AUDIT_READ),
    ]);
    const service = new RolesService(rolesRepo, permissionsRepo);
    const actor = buildActor({
      rank: 80,
      permissions: new Set([PERMISSIONS.ROLES_MANAGE]),
    });

    await expect(
      service.create(actor, {
        code: 'auditor',
        title: 'Auditor',
        rank: 40,
        permissionIds: [1],
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('пропускает роль в пределах ранга и прав актёра', async () => {
    const { rolesRepo, permissionsRepo } = buildRepositories();
    permissionsRepo.findByIds.mockResolvedValue([
      buildPermission(PERMISSIONS.ROLES_MANAGE),
    ]);
    rolesRepo.findById.mockResolvedValue(buildRole());
    const service = new RolesService(rolesRepo, permissionsRepo);
    const actor = buildActor({ rank: 80 });

    await expect(
      service.create(actor, {
        code: 'sub-admin',
        title: 'Sub admin',
        rank: 40,
        permissionIds: [1],
      }),
    ).resolves.toBeDefined();
  });

  it('конфликт code -> ConflictException', async () => {
    const { rolesRepo, permissionsRepo, saveMock } = buildRepositories();
    saveMock.mockRejectedValue(uniqueViolation());
    const service = new RolesService(rolesRepo, permissionsRepo);
    const actor = buildActor({ rank: 80 });

    await expect(
      service.create(actor, { code: 'dup', title: 'Dup', rank: 10 }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('RolesService.update — снятие is_system (§1.4)', () => {
  it('отклоняет снятие is_system, если у роли нет явных users.manage+roles.manage', async () => {
    const { rolesRepo, permissionsRepo } = buildRepositories();
    rolesRepo.findById.mockResolvedValue(
      buildRole({ isSystem: true, permissions: [] }),
    );
    const service = new RolesService(rolesRepo, permissionsRepo);
    const actor = buildActor({ isSystem: true, rank: 100 });

    await expect(
      service.update(actor, 1, { isSystem: false }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('разрешает снятие is_system, если явные users.manage+roles.manage уже проставлены', async () => {
    const { rolesRepo, permissionsRepo } = buildRepositories();
    rolesRepo.findById.mockResolvedValue(
      buildRole({
        isSystem: true,
        permissions: [
          buildPermission(PERMISSIONS.USERS_MANAGE, 1),
          buildPermission(PERMISSIONS.ROLES_MANAGE, 2),
        ],
      }),
    );
    const service = new RolesService(rolesRepo, permissionsRepo);
    const actor = buildActor({ isSystem: true, rank: 100 });

    await expect(
      service.update(actor, 1, { isSystem: false }),
    ).resolves.toBeDefined();
  });

  it('запрещает менять системный статус актёру без системной роли', async () => {
    const { rolesRepo, permissionsRepo } = buildRepositories();
    rolesRepo.findById.mockResolvedValue(buildRole({ isSystem: false }));
    const service = new RolesService(rolesRepo, permissionsRepo);
    const actor = buildActor({ isSystem: false, rank: 80 });

    await expect(
      service.update(actor, 1, { isSystem: true }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});

// security-audit-2026-08-31.md HIGH №2 — снятие is_system у роли отбирает байпас у ВСЕХ её
// активных держателей разом, не у одного пользователя (в отличие от уже защищённого уровня
// пользователя, EXPANSION_TASKS.md §1.6) — до этого фикса headcount на уровне роли не проверялся
// вообще. Сам подсчёт "останется ли хотя бы один активный системный держатель" — в
// RolesRepository.saveGuardedBySystemRoleHeadcount (реальный Postgres, проверено в
// test/rbac-role-self-lockout.e2e-spec.ts); здесь — только то, что сервис действительно идёт
// через guarded-путь для этой ветки и правильно интерпретирует 'blocked'.
describe('RolesService.update — headcount-барьер при снятии is_system (security-audit HIGH №2)', () => {
  function buildFlipOffRole(): Role {
    return buildRole({
      isSystem: true,
      permissions: [
        buildPermission(PERMISSIONS.USERS_MANAGE, 1),
        buildPermission(PERMISSIONS.ROLES_MANAGE, 2),
      ],
    });
  }

  it('снятие is_system идёт через saveGuardedBySystemRoleHeadcount, не через обычный save', async () => {
    const { rolesRepo, permissionsRepo, saveGuardedMock, saveMock } =
      buildRepositories();
    rolesRepo.findById.mockResolvedValue(buildFlipOffRole());
    const service = new RolesService(rolesRepo, permissionsRepo);
    const actor = buildActor({ isSystem: true, rank: 100 });

    await expect(
      service.update(actor, 1, { isSystem: false }),
    ).resolves.toBeDefined();
    expect(saveGuardedMock).toHaveBeenCalledTimes(1);
    expect(saveMock).not.toHaveBeenCalled();
  });

  it("'blocked' от guarded-save -> BadRequestException, роль не сохраняется обычным save", async () => {
    const { rolesRepo, permissionsRepo, saveGuardedMock, saveMock } =
      buildRepositories();
    rolesRepo.findById.mockResolvedValue(buildFlipOffRole());
    saveGuardedMock.mockResolvedValue('blocked');
    const service = new RolesService(rolesRepo, permissionsRepo);
    const actor = buildActor({ isSystem: true, rank: 100 });

    await expect(
      service.update(actor, 1, { isSystem: false }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(saveMock).not.toHaveBeenCalled();
  });

  it('правка роли, остающейся системной, идёт обычным save — headcount не проверяется', async () => {
    const { rolesRepo, permissionsRepo, saveGuardedMock, saveMock } =
      buildRepositories();
    rolesRepo.findById.mockResolvedValue(buildRole({ isSystem: true }));
    const service = new RolesService(rolesRepo, permissionsRepo);
    const actor = buildActor({ isSystem: true, rank: 100 });

    await expect(
      service.update(actor, 1, { title: 'Новое название' }),
    ).resolves.toBeDefined();
    expect(saveMock).toHaveBeenCalledTimes(1);
    expect(saveGuardedMock).not.toHaveBeenCalled();
  });
});

describe('RolesService.remove — конфликт использования (§1.4, FK RESTRICT)', () => {
  it('удаление используемой роли -> BadRequestException', async () => {
    const { rolesRepo, permissionsRepo, removeMock } = buildRepositories();
    rolesRepo.findById.mockResolvedValue(buildRole());
    removeMock.mockRejectedValue(foreignKeyViolation());
    const service = new RolesService(rolesRepo, permissionsRepo);
    const actor = buildActor({ rank: 80 });

    await expect(service.remove(actor, 1)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('удаление неиспользуемой роли проходит', async () => {
    const { rolesRepo, permissionsRepo, removeMock } = buildRepositories();
    rolesRepo.findById.mockResolvedValue(buildRole());
    removeMock.mockResolvedValue(undefined);
    const service = new RolesService(rolesRepo, permissionsRepo);
    const actor = buildActor({ rank: 80 });

    await expect(service.remove(actor, 1)).resolves.toBeUndefined();
    expect(removeMock).toHaveBeenCalledWith(1);
  });
});

// /code-review high (реальный privilege escalation): remove() не проверял rank/is_system до
// удаления роли — не-системный актёр мог безвозвратно удалить роль выше своего ранга или
// системную, хотя создать/изменить/назначить её тем же актёром запрещено везде ещё.
describe('RolesService.remove — rank/is_system барьер (закрытый /code-review high пробел)', () => {
  it('запрещает удалить роль с рангом выше своего', async () => {
    const { rolesRepo, permissionsRepo, removeMock } = buildRepositories();
    rolesRepo.findById.mockResolvedValue(buildRole({ rank: 90 }));
    const service = new RolesService(rolesRepo, permissionsRepo);
    const actor = buildActor({ rank: 40, isSystem: false });

    await expect(service.remove(actor, 1)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(removeMock).not.toHaveBeenCalled();
  });

  it('запрещает не-системному актёру удалить системную роль, даже с низким рангом', async () => {
    const { rolesRepo, permissionsRepo, removeMock } = buildRepositories();
    rolesRepo.findById.mockResolvedValue(
      buildRole({ rank: 10, isSystem: true, permissions: [] }),
    );
    const service = new RolesService(rolesRepo, permissionsRepo);
    const actor = buildActor({
      rank: 100,
      isSystem: false,
      permissions: new Set([
        PERMISSIONS.ROLES_MANAGE,
        PERMISSIONS.USERS_MANAGE,
      ]),
    });

    await expect(service.remove(actor, 1)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(removeMock).not.toHaveBeenCalled();
  });

  it('разрешает удалить роль в пределах ранга', async () => {
    const { rolesRepo, permissionsRepo, removeMock } = buildRepositories();
    rolesRepo.findById.mockResolvedValue(buildRole({ rank: 40 }));
    removeMock.mockResolvedValue(undefined);
    const service = new RolesService(rolesRepo, permissionsRepo);
    const actor = buildActor({ rank: 80 });

    await expect(service.remove(actor, 1)).resolves.toBeUndefined();
    expect(removeMock).toHaveBeenCalledWith(1);
  });
});
