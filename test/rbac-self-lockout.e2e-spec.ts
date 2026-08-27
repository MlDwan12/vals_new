import { BadRequestException, INestApplication } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Test, TestingModule } from '@nestjs/testing';
import { StartedTestContainer } from 'testcontainers';
import { Repository } from 'typeorm';
import { AuthenticatedRequestUser } from '../src/core/guards/auth.guard';
import { PERMISSIONS } from '../src/core/permissions/permission.registry';
import { User } from '../src/modules/users/domain/user.entity';
import { UsersService } from '../src/modules/users/application/users.service';
import { resolveRoleId } from './support/resolve-role-id';
import { runTestMigrations, startTestDatabase } from './support/test-database';

// EXPANSION_TASKS.md §1.6 — нельзя отключить, удалить, понизить или ограничить сроком последнего
// активного пользователя с системной ролью. Проверяется на уровне UsersService (real Postgres +
// pg_advisory_xact_lock), не через HTTP — сам механизм самоблокировки не завязан на то, каким
// путём (легаси @Roles или новый @Perm) вызван сервис.
describe('Self-lockout последнего активного системного пользователя (e2e)', () => {
  let app: INestApplication;
  let postgres: StartedTestContainer;
  let usersService: UsersService;
  let usersRepo: Repository<User>;
  let moduleRef: TestingModule;
  let developerRoleId: number;

  function systemActor(sub: number): AuthenticatedRequestUser {
    return {
      sub,
      username: 'actor',
      role: 'developer',
      rank: 100,
      isSystem: true,
      permissions: new Set([PERMISSIONS.USERS_MANAGE]),
    };
  }

  beforeAll(async () => {
    postgres = await startTestDatabase();
    await runTestMigrations();

    const { AppModule } =
      require('../src/app.module') as typeof import('../src/app.module');

    moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    usersService = moduleRef.get(UsersService);
    usersRepo = moduleRef.get<Repository<User>>(getRepositoryToken(User));
    developerRoleId = await resolveRoleId(moduleRef, 'developer');
  }, 60_000);

  afterAll(async () => {
    await app.close();
    await postgres.stop();
  });

  async function createDeveloper(username: string): Promise<User> {
    return usersRepo.save(
      usersRepo.create({
        username,
        password: 'irrelevant-hash',
        roleId: developerRoleId,
        isActive: true,
      }),
    );
  }

  // Файл делит одну БД между it-блоками — developer'ы из предыдущих тестов остаются активными.
  // Каждый "solo"-сценарий должен явно гарантировать, что переданный id — единственный активный
  // системный пользователь на момент проверки, иначе он перестаёт быть "solo" по мере накопления
  // состояния между тестами.
  async function deactivateOtherDevelopers(
    ...exceptIds: number[]
  ): Promise<void> {
    await usersRepo
      .createQueryBuilder()
      .update(User)
      .set({ isActive: false })
      .where('role_id = :roleId', { roleId: developerRoleId })
      .andWhere('id NOT IN (:...exceptIds)', { exceptIds })
      .execute();
  }

  it('блокирует отключение единственного активного developer', async () => {
    const solo = await createDeveloper('lockout-disable-solo');
    await deactivateOtherDevelopers(solo.id);

    await expect(
      usersService.update(systemActor(solo.id), solo.id, { isActive: false }),
    ).rejects.toBeInstanceOf(BadRequestException);

    const stillActive = await usersRepo.findOneByOrFail({ id: solo.id });
    expect(stillActive.isActive).toBe(true);
  });

  it('разрешает отключение, если остаётся другой активный developer', async () => {
    const first = await createDeveloper('lockout-disable-first');
    const second = await createDeveloper('lockout-disable-second');
    await deactivateOtherDevelopers(first.id, second.id);

    await expect(
      usersService.update(systemActor(first.id), first.id, {
        isActive: false,
      }),
    ).resolves.toBeDefined();
  });

  it('блокирует удаление единственного активного developer', async () => {
    const solo = await createDeveloper('lockout-delete-solo');
    await deactivateOtherDevelopers(solo.id);

    await expect(
      usersService.remove(systemActor(solo.id), solo.id),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(await usersRepo.findOneBy({ id: solo.id })).not.toBeNull();
  });

  it('блокирует смену роли единственного активного developer на несистемную', async () => {
    const solo = await createDeveloper('lockout-rechange-solo');
    await deactivateOtherDevelopers(solo.id);
    const contentManagerRoleId = await resolveRoleId(
      moduleRef,
      'content_manager',
    );

    await expect(
      usersService.changeRole(systemActor(solo.id), solo.id, {
        roleId: contentManagerRoleId,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('блокирует ограничение сроком единственного активного developer', async () => {
    const solo = await createDeveloper('lockout-expiry-solo');
    await deactivateOtherDevelopers(solo.id);
    const future = new Date(
      Date.now() + 30 * 24 * 60 * 60 * 1000,
    ).toISOString();

    await expect(
      usersService.setAccessExpiry(systemActor(solo.id), solo.id, {
        accessExpiresAt: future,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
