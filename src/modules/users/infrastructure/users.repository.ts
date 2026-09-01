import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  DataSource,
  EntityManager,
  LessThanOrEqual,
  Repository,
} from 'typeorm';
import { isEmptyPatch } from '../../../core/persistence/is-empty-patch.util';
import { withSystemRoleHeadcountLock } from '../../../core/persistence/system-role-headcount-lock.util';
import { User } from '../domain/user.entity';

interface CreateUserRecord {
  username: string;
  password: string;
  roleId: number;
  accessExpiresAt?: Date | null;
}

interface UpdateUserRecord {
  username?: string;
  password?: string;
  isActive?: boolean;
  roleId?: number;
  accessExpiresAt?: Date | null;
}

export type SystemRoleGuardedResult = 'ok' | 'blocked' | 'not_found';

@Injectable()
export class UsersRepository {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(User) private readonly repo: Repository<User>,
  ) {}

  // role.code — нужен в теле ответа /auth/login (WhoAmI), permissions здесь не нужны — токен
  // больше не несёт роль (EXPANSION_TASKS.md §1.4), только id, права резолвятся заново на каждый
  // защищённый запрос через findAuthContextById.
  findByUsernameForAuth(username: string): Promise<User | null> {
    return this.repo.findOne({
      where: { username },
      relations: { role: true },
      select: {
        id: true,
        username: true,
        password: true,
        isActive: true,
        accessExpiresAt: true,
        role: { id: true, code: true },
      },
    });
  }

  // Живой источник роли/прав/isActive/access_expires_at на каждый защищённый запрос
  // (AuthContextService, EXPANSION_TASKS.md §1.4).
  findAuthContextById(id: number): Promise<User | null> {
    return this.repo.findOne({
      where: { id },
      relations: { role: { permissions: true } },
    });
  }

  findByUsername(username: string): Promise<User | null> {
    return this.repo.findOne({ where: { username } });
  }

  findById(id: number): Promise<User | null> {
    return this.repo.findOne({ where: { id }, relations: { role: true } });
  }

  async findAndCount(page: number, limit: number): Promise<[User[], number]> {
    return this.repo.findAndCount({
      relations: { role: true },
      order: { id: 'ASC' },
      skip: (page - 1) * limit,
      take: limit,
    });
  }

  // Список тех, у кого доступ истекает в ближайшие N дней (EXPANSION_TASKS.md §1.3 — экран в
  // панели) — только активные, уже истёкшим/бессрочным тут делать нечего.
  findExpiringWithinDays(days: number): Promise<User[]> {
    const threshold = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
    return this.repo.find({
      where: { isActive: true, accessExpiresAt: LessThanOrEqual(threshold) },
      relations: { role: true },
      order: { accessExpiresAt: 'ASC' },
    });
  }

  create(data: CreateUserRecord): Promise<User> {
    return this.repo.save(this.repo.create(data));
  }

  async update(id: number, patch: UpdateUserRecord): Promise<User | null> {
    if (!isEmptyPatch(patch)) {
      await this.repo.update(id, patch);
    }
    return this.findById(id);
  }

  async remove(id: number): Promise<void> {
    await this.repo.delete(id);
  }

  // Оборачивает мутацию пользователя проверкой "не последний ли это активный системный
  // пользователь" (EXPANSION_TASKS.md §1.6) — вызывается только там, где мутация МОЖЕТ вывести
  // пользователя из пула активных системных (отключение, удаление, смена роли на несистемную,
  // назначение срока доступа). Если целевой пользователь сейчас не активный системный — проверка
  // не нужна вообще, мутация выполняется как обычно.
  async runGuardedBySystemRoleHeadcount(
    userId: number,
    mutate: (manager: EntityManager) => Promise<void>,
  ): Promise<SystemRoleGuardedResult> {
    return withSystemRoleHeadcountLock(this.dataSource, async (manager) => {
      const target = await manager.findOne(User, {
        where: { id: userId },
        relations: { role: true },
      });
      if (!target) return 'not_found';

      const targetIsActiveSystemHolder =
        target.isActive && target.role.isSystem;
      if (targetIsActiveSystemHolder) {
        const remaining = await manager
          .createQueryBuilder(User, 'user')
          .innerJoin('user.role', 'role')
          .where('role.is_system = true')
          .andWhere('user.is_active = true')
          .andWhere('user.id != :userId', { userId })
          .getCount();

        if (remaining === 0) return 'blocked';
      }

      await mutate(manager);
      return 'ok';
    });
  }
}
