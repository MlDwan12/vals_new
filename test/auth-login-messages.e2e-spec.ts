import { INestApplication } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { StartedTestContainer } from 'testcontainers';
import { Repository } from 'typeorm';
import { User } from '../src/modules/users/domain/user.entity';
import { resolveRoleId } from './support/resolve-role-id';
import { runTestMigrations, startTestDatabase } from './support/test-database';

const ORIGIN = 'http://localhost:3001';
const PASSWORD = 'LoginMsgPass123!';

// EXPANSION_TASKS.md §1, приёмка п.6 — истёкший доступ, отключённый аккаунт и неверный пароль
// дают ТРИ РАЗНЫХ сообщения вошедшему пользователю, но "нет такого логина" и "неверный пароль"
// остаются одним и тем же текстом (анти-энумерация, не новое требование — M10 в журнале).
describe('Auth: три разных сообщения при входе (e2e)', () => {
  let app: INestApplication;
  let postgres: StartedTestContainer;
  let users: Repository<User>;
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
    await app.init();

    users = moduleRef.get<Repository<User>>(getRepositoryToken(User));
  }, 60_000);

  afterAll(async () => {
    await app.close();
    await postgres.stop();
  });

  async function createUser(
    username: string,
    overrides: { isActive?: boolean; accessExpiresAt?: Date | null } = {},
  ): Promise<User> {
    const roleId = await resolveRoleId(moduleRef, 'content_manager');
    const passwordHash = await bcrypt.hash(PASSWORD, 4);
    return users.save(
      users.create({
        username,
        password: passwordHash,
        roleId,
        isActive: overrides.isActive ?? true,
        accessExpiresAt: overrides.accessExpiresAt ?? null,
      }),
    );
  }

  async function loginMessage(
    username: string,
    password: string,
  ): Promise<{ status: number; message: string }> {
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .set('Origin', ORIGIN)
      .send({ username, password });
    return {
      status: response.status,
      message: (response.body as { message: string }).message,
    };
  }

  it('4 исхода логина: неверные данные совпадают, disabled/expired/успех — разные', async () => {
    await createUser('login-msg-known');
    await createUser('login-msg-disabled', { isActive: false });
    await createUser('login-msg-expired', {
      accessExpiresAt: new Date(Date.now() - 60_000),
    });

    const unknownLogin = await loginMessage('login-msg-does-not-exist', 'x');
    const wrongPassword = await loginMessage(
      'login-msg-known',
      'WrongPassword123!',
    );
    const disabled = await loginMessage('login-msg-disabled', PASSWORD);
    const expired = await loginMessage('login-msg-expired', PASSWORD);
    const success = await loginMessage('login-msg-known', PASSWORD);

    expect(unknownLogin.status).toBe(401);
    expect(wrongPassword.status).toBe(401);
    expect(disabled.status).toBe(401);
    expect(expired.status).toBe(401);
    expect(success.status).toBe(201);

    // "нет такого логина" и "неверный пароль" — один и тот же текст (анти-энумерация).
    expect(wrongPassword.message).toBe(unknownLogin.message);

    // disabled/expired — каждый свой отдельный текст, не совпадающий ни с общим, ни друг с другом.
    expect(disabled.message).not.toBe(unknownLogin.message);
    expect(expired.message).not.toBe(unknownLogin.message);
    expect(disabled.message).not.toBe(expired.message);
  });

  it('доступ ещё не истёк (будущая дата) — логин проходит как обычно', async () => {
    await createUser('login-msg-not-yet-expired', {
      accessExpiresAt: new Date(Date.now() + 60_000),
    });

    const response = await loginMessage('login-msg-not-yet-expired', PASSWORD);
    expect(response.status).toBe(201);
  });
});
