import 'reflect-metadata';
import * as bcrypt from 'bcrypt';
import { Role as RoleEnum } from '../../core/enums/role.enum';
import dataSource from '../../data-source';
import { Role } from '../../modules/roles/domain/role.entity';
import { User } from '../../modules/users/domain/user.entity';

const BCRYPT_COST = 12;
const MIN_PASSWORD_LENGTH = 8;

async function main(): Promise<void> {
  const username = process.env.SEED_DEVELOPER_USERNAME?.trim().toLowerCase();
  const password = process.env.SEED_DEVELOPER_PASSWORD;

  if (!username) {
    throw new Error('SEED_DEVELOPER_USERNAME не задан в .env');
  }
  if (!password || password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(
      `SEED_DEVELOPER_PASSWORD не задан или короче ${MIN_PASSWORD_LENGTH} символов`,
    );
  }

  await dataSource.initialize();

  try {
    const repo = dataSource.getRepository(User);
    const existing = await repo.findOne({ where: { username } });

    if (existing) {
      console.log(
        `Пользователь "${username}" уже существует (id=${existing.id}), сид пропущен.`,
      );
      return;
    }

    // Роль сидится миграцией AddRolesAndPermissions с тем же кодом, что и старый enum
    // (EXPANSION_TASKS.md §1.7) — findOneByOrFail здесь означает "миграция ещё не применена".
    const roleRepo = dataSource.getRepository(Role);
    const developerRole = await roleRepo.findOneByOrFail({
      code: RoleEnum.DEVELOPER,
    });

    const passwordHash = await bcrypt.hash(password, BCRYPT_COST);
    const user = await repo.save(
      repo.create({
        username,
        password: passwordHash,
        roleId: developerRole.id,
      }),
    );

    console.log(
      `Создан пользователь-разработчик "${user.username}" (id=${user.id}).`,
    );
  } finally {
    await dataSource.destroy();
  }
}

main().catch((error: unknown) => {
  console.error('Не удалось выполнить сид разработчика', error);
  process.exitCode = 1;
});
