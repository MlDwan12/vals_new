import { BadRequestException, INestApplication } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Test, TestingModule } from '@nestjs/testing';
import { StartedTestContainer } from 'testcontainers';
import { Repository } from 'typeorm';
import { AuthenticatedRequestUser } from '../src/core/guards/auth.guard';
import { PERMISSIONS } from '../src/core/permissions/permission.registry';
import { RolesService } from '../src/modules/roles/application/roles.service';
import { Permission } from '../src/modules/roles/domain/permission.entity';
import { Role } from '../src/modules/roles/domain/role.entity';
import { UsersService } from '../src/modules/users/application/users.service';
import { User } from '../src/modules/users/domain/user.entity';
import { runTestMigrations, startTestDatabase } from './support/test-database';

// security-audit-2026-08-31.md HIGH №2 — снятие is_system с ПОСЛЕДНЕЙ системной роли отбирает
// байпас у ВСЕХ её активных держателей одновременно. До фикса это не проверялось вообще:
// canAssignRole коротко замыкает на true для любого resultingIsSystem, когда actor.isSystem===true
// (держатель системной роли может отредактировать саму себя). Барьер симметричен уже
// существующему на уровне ПОЛЬЗОВАТЕЛЯ (rbac-self-lockout.e2e-spec.ts, EXPANSION_TASKS.md §1.6),
// но считает держателей РОЛИ, а не одного userId — вызывается напрямую через сервис, не через
// HTTP, тот же приём, что и в сестринском файле (механизм не завязан на путь вызова).
describe('Self-lockout при снятии is_system у роли (e2e, security-audit HIGH №2)', () => {
  let app: INestApplication;
  let postgres: StartedTestContainer;
  let rolesService: RolesService;
  let usersService: UsersService;
  let rolesRepo: Repository<Role>;
  let usersRepo: Repository<User>;
  let permissionsRepo: Repository<Permission>;
  let moduleRef: TestingModule;
  let usersManageId: number;
  let rolesManageId: number;

  function systemActor(sub: number): AuthenticatedRequestUser {
    return {
      sub,
      username: 'actor',
      role: 'developer',
      rank: 100,
      isSystem: true,
      permissions: new Set(),
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

    rolesService = moduleRef.get(RolesService);
    usersService = moduleRef.get(UsersService);
    rolesRepo = moduleRef.get<Repository<Role>>(getRepositoryToken(Role));
    usersRepo = moduleRef.get<Repository<User>>(getRepositoryToken(User));
    permissionsRepo = moduleRef.get<Repository<Permission>>(
      getRepositoryToken(Permission),
    );

    usersManageId = (
      await permissionsRepo.findOneByOrFail({ code: PERMISSIONS.USERS_MANAGE })
    ).id;
    rolesManageId = (
      await permissionsRepo.findOneByOrFail({ code: PERMISSIONS.ROLES_MANAGE })
    ).id;
  }, 60_000);

  afterAll(async () => {
    await app.close();
    await postgres.stop();
  });

  async function createSystemRole(rank: number): Promise<Role> {
    return rolesRepo.save(
      rolesRepo.create({
        code: `role-lockout-${Date.now()}-${Math.random()}`,
        title: 'Тестовая системная роль',
        description: null,
        rank,
        isSystem: true,
        permissions: [],
      }),
    );
  }

  async function createActiveHolder(roleId: number): Promise<User> {
    return usersRepo.save(
      usersRepo.create({
        username: `role-lockout-holder-${Date.now()}-${Math.random()}`,
        password: 'irrelevant-hash',
        roleId,
        isActive: true,
      }),
    );
  }

  // Файл делит одну БД между it-блоками (как и rbac-self-lockout.e2e-spec.ts) — держатели
  // системных ролей из предыдущих тестов (включая сидированного developer) остаются активными,
  // если явно не деактивированы. Считает по ВСЕМ системным ролям, не только developer — тесты
  // сами заводят дополнительные системные роли.
  async function deactivateAllOtherActiveSystemHolders(
    ...exceptIds: number[]
  ): Promise<void> {
    const systemRoleIds = (
      await rolesRepo.find({ where: { isSystem: true }, select: { id: true } })
    ).map((role) => role.id);
    if (systemRoleIds.length === 0) return;

    const qb = usersRepo
      .createQueryBuilder()
      .update(User)
      .set({ isActive: false })
      .where('role_id IN (:...systemRoleIds)', { systemRoleIds });
    if (exceptIds.length > 0) {
      qb.andWhere('id NOT IN (:...exceptIds)', { exceptIds });
    }
    await qb.execute();
  }

  it('блокирует снятие is_system, если держатель роли — единственный активный системный пользователь', async () => {
    const role = await createSystemRole(90);
    const holder = await createActiveHolder(role.id);
    await deactivateAllOtherActiveSystemHolders(holder.id);

    await expect(
      rolesService.update(systemActor(holder.id), role.id, {
        isSystem: false,
        permissionIds: [usersManageId, rolesManageId],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    const stillSystem = await rolesRepo.findOneByOrFail({ id: role.id });
    expect(stillSystem.isSystem).toBe(true);
  });

  it('разрешает снятие is_system, если остаётся другой активный системный держатель', async () => {
    const staying = await createSystemRole(91);
    const stayingHolder = await createActiveHolder(staying.id);

    const flipping = await createSystemRole(90);
    const flippingHolder = await createActiveHolder(flipping.id);

    await deactivateAllOtherActiveSystemHolders(
      stayingHolder.id,
      flippingHolder.id,
    );

    await expect(
      rolesService.update(systemActor(flippingHolder.id), flipping.id, {
        isSystem: false,
        permissionIds: [usersManageId, rolesManageId],
      }),
    ).resolves.toBeDefined();

    const flipped = await rolesRepo.findOneByOrFail({ id: flipping.id });
    expect(flipped.isSystem).toBe(false);
  });

  it('разрешает снятие is_system у роли без активных держателей — мутация никого не касается', async () => {
    const empty = await createSystemRole(90);
    await deactivateAllOtherActiveSystemHolders();
    // actor.sub здесь не читается update()-путём вообще (только isSystem/rank/permissions) —
    // identity не обязана совпадать с реальным держателем какой-либо роли, тот же приём, что и в
    // остальных it-блоках этого файла и в rbac-self-lockout.e2e-spec.ts.
    const actor = await createActiveHolder(empty.id);
    await usersRepo.update(actor.id, { isActive: false });

    await expect(
      rolesService.update(systemActor(actor.id), empty.id, {
        isSystem: false,
        permissionIds: [usersManageId, rolesManageId],
      }),
    ).resolves.toBeDefined();

    const flipped = await rolesRepo.findOneByOrFail({ id: empty.id });
    expect(flipped.isSystem).toBe(false);
  });

  // Общий advisory-лок (withSystemRoleHeadcountLock) существует именно для того, чтобы
  // сериализовать ЭТОТ путь (RolesRepository.saveGuardedBySystemRoleHeadcount) с параллельным
  // UsersRepository.runGuardedBySystemRoleHeadcount — без него оба запроса читают headcount ДО
  // того, как другой закоммитил свою мутацию, и оба проходят проверку, хотя вместе они обнуляют
  // всех активных системных пользователей. Раньше это утверждалось только комментарием, ни разу не
  // проверялось настоящей параллельностью (/code-review high, сессия 28).
  it('гонка "снять is_system у роли A" || "деактивировать последнего держателя роли B" — не может пройти оба', async () => {
    const roleA = await createSystemRole(90);
    const holderA = await createActiveHolder(roleA.id);

    const roleB = await createSystemRole(91);
    const holderB = await createActiveHolder(roleB.id);

    await deactivateAllOtherActiveSystemHolders(holderA.id, holderB.id);

    const results = await Promise.allSettled([
      rolesService.update(systemActor(holderA.id), roleA.id, {
        isSystem: false,
        permissionIds: [usersManageId, rolesManageId],
      }),
      usersService.update(systemActor(holderB.id), holderB.id, {
        isActive: false,
      }),
    ]);

    const rejected = results.filter((r) => r.status === 'rejected');
    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    // Без лока оба запроса читают headcount друг друга ДО коммита и оба проходят — с локом ровно
    // один должен быть отклонён, иначе после обеих мутаций не остаётся ни одного активного
    // системного пользователя (сам инвариант, который лок обязан защищать).
    expect(rejected).toHaveLength(1);
    expect(fulfilled).toHaveLength(1);
    expect(rejected[0].reason).toBeInstanceOf(BadRequestException);

    const stillActiveSystemHolders = await usersRepo
      .createQueryBuilder('user')
      .innerJoin('user.role', 'role')
      .where('role.is_system = true')
      .andWhere('user.is_active = true')
      .getCount();
    expect(stillActiveSystemHolders).toBeGreaterThan(0);
  });
});
