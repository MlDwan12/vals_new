import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { AuthenticatedRequestUser } from '../../../core/guards/auth.guard';
import { PERMISSIONS } from '../../../core/permissions/permission.registry';
import { Role } from '../../roles/domain/role.entity';
import { RolesRepository } from '../../roles/infrastructure/roles.repository';
import { User } from '../domain/user.entity';
import { UsersRepository } from '../infrastructure/users.repository';
import { UsersService } from './users.service';

function buildActor(
  overrides: Partial<AuthenticatedRequestUser> = {},
): AuthenticatedRequestUser {
  return {
    sub: 1,
    username: 'actor',
    role: 'admin',
    rank: 80,
    isSystem: false,
    permissions: new Set([PERMISSIONS.USERS_MANAGE]),
    ...overrides,
  };
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

function buildUser(overrides: Partial<User> = {}): User {
  return {
    id: 2,
    username: 'target',
    password: 'hash',
    roleId: 1,
    role: buildRole(),
    isActive: true,
    accessExpiresAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

// guardMock/updateMock — отдельные переменные, не usersRepository.runGuardedBySystemRoleHeadcount/
// .update (@typescript-eslint/unbound-method, тот же приём, что в tags.service.spec.ts).
function buildRepositories(): {
  usersRepository: jest.Mocked<UsersRepository>;
  rolesRepository: jest.Mocked<RolesRepository>;
  guardMock: jest.Mock;
  updateMock: jest.Mock;
} {
  const guardMock = jest.fn().mockResolvedValue('ok');
  const updateMock = jest.fn();
  const usersRepository = {
    findById: jest.fn(),
    findByUsername: jest.fn(),
    create: jest.fn(),
    update: updateMock,
    runGuardedBySystemRoleHeadcount: guardMock,
  } as unknown as jest.Mocked<UsersRepository>;
  const rolesRepository = {
    findById: jest.fn(),
    findByCode: jest.fn(),
  } as unknown as jest.Mocked<RolesRepository>;
  return { usersRepository, rolesRepository, guardMock, updateMock };
}

describe('UsersService.changeRole — §1.5', () => {
  it('запрещает управлять пользователем с ролью выше своей', async () => {
    const { usersRepository, rolesRepository } = buildRepositories();
    usersRepository.findById.mockResolvedValue(
      buildUser({ role: buildRole({ rank: 100 }) }),
    );
    const service = new UsersService(usersRepository, rolesRepository, {
      setContext: jest.fn(),
    } as never);
    const actor = buildActor({ rank: 80 });

    await expect(
      service.changeRole(actor, 2, { roleId: 5 }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('запрещает назначить роль с правом, которого нет у актёра', async () => {
    const { usersRepository, rolesRepository } = buildRepositories();
    usersRepository.findById.mockResolvedValue(
      buildUser({ role: buildRole({ rank: 40 }) }),
    );
    rolesRepository.findById.mockResolvedValue(
      buildRole({
        id: 5,
        rank: 40,
        permissions: [
          { id: 1, code: PERMISSIONS.ROLES_MANAGE, title: '', group: 'roles' },
        ],
      }),
    );
    const service = new UsersService(usersRepository, rolesRepository, {
      setContext: jest.fn(),
    } as never);
    const actor = buildActor({
      rank: 80,
      permissions: new Set([PERMISSIONS.USERS_MANAGE]),
    });

    await expect(
      service.changeRole(actor, 2, { roleId: 5 }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('в пределах ранга/прав — вызывает лок-гвард и проходит', async () => {
    const { usersRepository, rolesRepository, guardMock } = buildRepositories();
    usersRepository.findById
      .mockResolvedValueOnce(buildUser({ role: buildRole({ rank: 40 }) }))
      .mockResolvedValueOnce(buildUser({ roleId: 5 }));
    rolesRepository.findById.mockResolvedValue(buildRole({ id: 5, rank: 40 }));
    const service = new UsersService(usersRepository, rolesRepository, {
      setContext: jest.fn(),
    } as never);
    const actor = buildActor({ rank: 80 });

    await expect(
      service.changeRole(actor, 2, { roleId: 5 }),
    ).resolves.toBeDefined();
    expect(guardMock).toHaveBeenCalledWith(2, expect.any(Function));
  });

  it('advisory-lock guard вернул blocked -> BadRequestException', async () => {
    const { usersRepository, rolesRepository, guardMock } = buildRepositories();
    usersRepository.findById.mockResolvedValue(
      buildUser({ role: buildRole({ rank: 40 }) }),
    );
    rolesRepository.findById.mockResolvedValue(buildRole({ id: 5, rank: 40 }));
    guardMock.mockResolvedValue('blocked');
    const service = new UsersService(usersRepository, rolesRepository, {
      setContext: jest.fn(),
    } as never);
    const actor = buildActor({ rank: 80 });

    await expect(
      service.changeRole(actor, 2, { roleId: 5 }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

// /code-review high (реальный privilege escalation): resetPassword() не проверял rank/is_system
// вообще — держатель одного лишь users.reset_password мог сбросить пароль ЛЮБОГО пользователя,
// включая того, кто выше по рангу или системный, и де-факто войти под его личностью.
describe('UsersService.resetPassword — rank-барьер (закрытый /code-review high пробел)', () => {
  it('запрещает сбросить пароль пользователю с ролью выше своей', async () => {
    const { usersRepository, rolesRepository, updateMock } =
      buildRepositories();
    usersRepository.findById.mockResolvedValue(
      buildUser({ role: buildRole({ rank: 100 }) }),
    );
    const service = new UsersService(usersRepository, rolesRepository, {
      setContext: jest.fn(),
    } as never);
    const actor = buildActor({ rank: 80 });

    await expect(
      service.resetPassword(actor, 2, { password: 'NewStrongPass123!' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('разрешает сброс пароля в пределах ранга', async () => {
    const { usersRepository, rolesRepository, updateMock } =
      buildRepositories();
    usersRepository.findById.mockResolvedValue(
      buildUser({ role: buildRole({ rank: 40 }) }),
    );
    updateMock.mockResolvedValue(buildUser());
    const service = new UsersService(usersRepository, rolesRepository, {
      setContext: jest.fn(),
    } as never);
    const actor = buildActor({ rank: 80 });

    await service.resetPassword(actor, 2, { password: 'NewStrongPass123!' });
    expect(updateMock).toHaveBeenCalledTimes(1);
    const [calledId, calledPatch] = updateMock.mock.calls[0] as [
      number,
      { password: string },
    ];
    expect(calledId).toBe(2);
    expect(typeof calledPatch.password).toBe('string');
  });
});

// /code-review high (altitude-ревью, тот же класс бага, что уже дважды закрывали в этой сессии):
// update()/remove() работают с произвольным id пользователя точно так же, как changeRole/
// setAccessExpiry/resetPassword, но были без rank/is_system-проверки вообще — легаси-гейт
// @Roles(Role.DEVELOPER) на роуте сам по себе не структурная гарантия (RolesService.update()
// осознанно позволяет понизить ранг/снять is_system у самой роли developer).
describe('UsersService.update/remove — rank-барьер (закрытый /code-review high пробел)', () => {
  it('update() запрещает трогать пользователя с ролью выше своей', async () => {
    const { usersRepository, rolesRepository, updateMock } =
      buildRepositories();
    usersRepository.findById.mockResolvedValue(
      buildUser({ role: buildRole({ rank: 100 }) }),
    );
    const service = new UsersService(usersRepository, rolesRepository, {
      setContext: jest.fn(),
    } as never);
    const actor = buildActor({ rank: 80 });

    await expect(
      service.update(actor, 2, { username: 'newname' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('update() разрешает правку в пределах ранга', async () => {
    const { usersRepository, rolesRepository, updateMock } =
      buildRepositories();
    usersRepository.findById.mockResolvedValue(
      buildUser({ role: buildRole({ rank: 40 }) }),
    );
    updateMock.mockResolvedValue(buildUser({ username: 'newname' }));
    const service = new UsersService(usersRepository, rolesRepository, {
      setContext: jest.fn(),
    } as never);
    const actor = buildActor({ rank: 80 });

    await expect(
      service.update(actor, 2, { username: 'newname' }),
    ).resolves.toBeDefined();
    expect(updateMock).toHaveBeenCalledTimes(1);
  });

  it('remove() запрещает удалить пользователя с ролью выше своей', async () => {
    const { usersRepository, rolesRepository, guardMock } = buildRepositories();
    usersRepository.findById.mockResolvedValue(
      buildUser({ role: buildRole({ rank: 100 }) }),
    );
    const service = new UsersService(usersRepository, rolesRepository, {
      setContext: jest.fn(),
    } as never);
    const actor = buildActor({ rank: 80 });

    await expect(service.remove(actor, 2)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(guardMock).not.toHaveBeenCalled();
  });

  it('remove() разрешает удаление в пределах ранга', async () => {
    const { usersRepository, rolesRepository, guardMock } = buildRepositories();
    usersRepository.findById.mockResolvedValue(
      buildUser({ role: buildRole({ rank: 40 }) }),
    );
    const service = new UsersService(usersRepository, rolesRepository, {
      setContext: jest.fn(),
    } as never);
    const actor = buildActor({ rank: 80 });

    await service.remove(actor, 2);
    expect(guardMock).toHaveBeenCalledWith(2, expect.any(Function));
  });
});

describe('UsersService.createWithRoleId — §1.3', () => {
  it('запрещает роль с рангом выше своего', async () => {
    const { usersRepository, rolesRepository } = buildRepositories();
    rolesRepository.findById.mockResolvedValue(buildRole({ rank: 100 }));
    const service = new UsersService(usersRepository, rolesRepository, {
      setContext: jest.fn(),
    } as never);
    const actor = buildActor({ rank: 80 });

    await expect(
      service.createWithRoleId(actor, {
        username: 'newbie',
        password: 'StrongPass123!',
        roleId: 1,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
