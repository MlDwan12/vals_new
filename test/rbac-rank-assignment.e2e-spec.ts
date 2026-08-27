import { INestApplication } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { StartedTestContainer } from 'testcontainers';
import { Repository } from 'typeorm';
import { PERMISSIONS } from '../src/core/permissions/permission.registry';
import { Permission } from '../src/modules/roles/domain/permission.entity';
import { Role as RoleEntity } from '../src/modules/roles/domain/role.entity';
import { User } from '../src/modules/users/domain/user.entity';
import { resolveRoleId } from './support/resolve-role-id';
import { runTestMigrations, startTestDatabase } from './support/test-database';

const ORIGIN = 'http://localhost:3001';

function cookieHeader(response: request.Response): string {
  const raw = response.headers['set-cookie'] as unknown as string[] | undefined;
  return (raw ?? []).map((cookie) => cookie.split(';')[0]).join('; ');
}

// EXPANSION_TASKS.md §1, приёмка п.4 — пользователь не может выдать роль или право, которого нет
// у него самого, ни на одной из двух ручек: создание/правка роли (RolesService, ранг + подмножество
// прав) и назначение роли пользователю (UsersService.createWithRoleId/changeRole).
describe('RBAC: нельзя выдать роль/право выше своего (e2e)', () => {
  let app: INestApplication;
  let postgres: StartedTestContainer;
  let users: Repository<User>;
  let rolesRepo: Repository<RoleEntity>;
  let permissionsRepo: Repository<Permission>;
  let moduleRef: TestingModule;

  beforeAll(async () => {
    postgres = await startTestDatabase();
    await runTestMigrations();

    const { AppModule } =
      require('../src/app.module') as typeof import('../src/app.module');

    moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    await app.init();

    users = moduleRef.get<Repository<User>>(getRepositoryToken(User));
    rolesRepo = moduleRef.get<Repository<RoleEntity>>(
      getRepositoryToken(RoleEntity),
    );
    permissionsRepo = moduleRef.get<Repository<Permission>>(
      getRepositoryToken(Permission),
    );
  }, 60_000);

  afterAll(async () => {
    await app.close();
    await postgres.stop();
  });

  async function loginAs(username: string, password: string): Promise<string> {
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .set('Origin', ORIGIN)
      .send({ username, password });
    expect(response.status).toBe(201);
    return cookieHeader(response);
  }

  // Ограниченная роль (не developer, не admin) — rank 50, ровно roles.manage+users.manage, без
  // audit.read — чтобы отдельно проверить и барьер по рангу, и барьер по подмножеству прав, не
  // используя admin (у которого сегодня весь реестр прав — см. миграцию AddRolesAndPermissions).
  async function createLimitedManager(): Promise<{
    userId: number;
    cookie: string;
    rank: number;
  }> {
    const usersManage = await permissionsRepo.findOneByOrFail({
      code: PERMISSIONS.USERS_MANAGE,
    });
    const rolesManage = await permissionsRepo.findOneByOrFail({
      code: PERMISSIONS.ROLES_MANAGE,
    });
    const role = await rolesRepo.save(
      rolesRepo.create({
        code: `limited-manager-${Date.now()}`,
        title: 'Ограниченный менеджер',
        rank: 50,
        isSystem: false,
        permissions: [usersManage, rolesManage],
      }),
    );

    const username = `limited-manager-${Date.now()}`;
    const password = 'LimitedManagerPass123!';
    const passwordHash = await bcrypt.hash(password, 4);
    const user = await users.save(
      users.create({
        username,
        password: passwordHash,
        roleId: role.id,
        isActive: true,
      }),
    );

    const cookie = await loginAs(username, password);
    return { userId: user.id, cookie, rank: role.rank };
  }

  it('POST /admin/roles: нельзя создать роль с рангом выше своего', async () => {
    const actor = await createLimitedManager();

    const response = await request(app.getHttpServer())
      .post('/admin/roles')
      .set('Origin', ORIGIN)
      .set('Cookie', actor.cookie)
      .send({ code: `too_high_${Date.now()}`, title: 'Too high', rank: 90 });

    expect(response.status).toBe(403);
  });

  it('POST /admin/roles: нельзя выдать новой роли право, которого нет у актёра', async () => {
    const actor = await createLimitedManager();
    const auditRead = await permissionsRepo.findOneByOrFail({
      code: PERMISSIONS.AUDIT_READ,
    });

    const response = await request(app.getHttpServer())
      .post('/admin/roles')
      .set('Origin', ORIGIN)
      .set('Cookie', actor.cookie)
      .send({
        code: `sneaky_audit_${Date.now()}`,
        title: 'Sneaky audit',
        rank: 10,
        permissionIds: [auditRead.id],
      });

    expect(response.status).toBe(403);
  });

  it('POST /admin/roles: роль в пределах ранга и прав актёра — проходит (201)', async () => {
    const actor = await createLimitedManager();
    const usersManage = await permissionsRepo.findOneByOrFail({
      code: PERMISSIONS.USERS_MANAGE,
    });

    const response = await request(app.getHttpServer())
      .post('/admin/roles')
      .set('Origin', ORIGIN)
      .set('Cookie', actor.cookie)
      .send({
        code: `ok_role_${Date.now()}`,
        title: 'OK role',
        rank: 10,
        permissionIds: [usersManage.id],
      });

    expect(response.status).toBe(201);
  });

  it('POST /admin/users: нельзя завести пользователя под роль с правом, которого нет у актёра', async () => {
    const actor = await createLimitedManager();
    const adminRoleId = await resolveRoleId(moduleRef, 'admin'); // admin держит весь реестр прав

    const response = await request(app.getHttpServer())
      .post('/admin/users')
      .set('Origin', ORIGIN)
      .set('Cookie', actor.cookie)
      .send({
        username: `blocked-new-admin-${Date.now()}`,
        password: 'BlockedPass123!',
        roleId: adminRoleId,
      });

    expect(response.status).toBe(403);
  });

  it('PATCH /admin/users/:id/role: нельзя сменить роль пользователя, который выше по рангу', async () => {
    const actor = await createLimitedManager();
    const adminRoleId = await resolveRoleId(moduleRef, 'admin');
    const higherUser = await users.save(
      users.create({
        username: `higher-rank-target-${Date.now()}`,
        password: await bcrypt.hash('Whatever123!', 4),
        roleId: adminRoleId,
        isActive: true,
      }),
    );
    const targetRoleId = await resolveRoleId(moduleRef, 'client_manager');

    const response = await request(app.getHttpServer())
      .patch(`/admin/users/${higherUser.id}/role`)
      .set('Origin', ORIGIN)
      .set('Cookie', actor.cookie)
      .send({ roleId: targetRoleId });

    expect(response.status).toBe(403);
  });
});
