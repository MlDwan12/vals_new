import 'reflect-metadata';
import * as bcrypt from 'bcrypt';
import { Role } from '../../core/enums/role.enum';
import dataSource from '../../data-source';
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

    const passwordHash = await bcrypt.hash(password, BCRYPT_COST);
    const user = await repo.save(
      repo.create({ username, password: passwordHash, role: Role.DEVELOPER }),
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
