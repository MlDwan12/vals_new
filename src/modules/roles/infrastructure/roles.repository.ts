import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { withSystemRoleHeadcountLock } from '../../../core/persistence/system-role-headcount-lock.util';
// Импорт сущности из чужого домена только как типа для DataSource-based QueryBuilder — не тянет
// зависимость модулей (RolesModule не импортирует UsersModule, DataSource — глобальный провайдер,
// тот же приём, что уже использует auth.service.ts). Обсуждено и согласовано с пользователем
// (security-audit-2026-08-31.md HIGH №2) как альтернатива циклу forwardRef(UsersModule) —
// см. прецедент tariffs/tariff-periods для сравнения, здесь цикл не нужен вообще.
import { User } from '../../users/domain/user.entity';
import { Permission } from '../domain/permission.entity';
import { Role } from '../domain/role.entity';

export type SystemRoleHeadcountGuardResult = Role | 'blocked';

interface CreateRoleRecord {
  code: string;
  title: string;
  description: string | null;
  rank: number;
  isSystem: boolean;
  permissions: Permission[];
}

@Injectable()
export class RolesRepository {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Role) private readonly repo: Repository<Role>,
  ) {}

  findAll(): Promise<Role[]> {
    return this.repo.find({
      relations: { permissions: true },
      order: { rank: 'DESC' },
    });
  }

  findById(id: number): Promise<Role | null> {
    return this.repo.findOne({
      where: { id },
      relations: { permissions: true },
    });
  }

  findByIds(ids: number[]): Promise<Role[]> {
    if (!ids.length) return Promise.resolve([]);
    return this.repo.find({
      where: { id: In(ids) },
      relations: { permissions: true },
    });
  }

  // Резолв легаси-ролей по коду (4 сидированные роли) — используется только
  // UsersService.createWithRole() на трёх старых эндпоинтах (/admin/users/admins|...).
  findByCode(code: string): Promise<Role | null> {
    return this.repo.findOne({
      where: { code },
      relations: { permissions: true },
    });
  }

  create(data: CreateRoleRecord): Role {
    return this.repo.create(data);
  }

  save(role: Role): Promise<Role> {
    return this.repo.save(role);
  }

  async remove(id: number): Promise<void> {
    await this.repo.delete(id);
  }

  // Симметрично UsersRepository.runGuardedBySystemRoleHeadcount, но на уровне РОЛИ: снятие
  // is_system у роли отбирает байпас у ВСЕХ её активных держателей одновременно, не у одного
  // пользователя (security-audit-2026-08-31.md HIGH №2). Тот же advisory-лок сериализует оба
  // пути между собой — параллельные "деактивировать последнего пользователя роли B" и "снять
  // is_system у роли A" не могут оба пройти проверку одновременно.
  async saveGuardedBySystemRoleHeadcount(
    role: Role,
  ): Promise<SystemRoleHeadcountGuardResult> {
    return withSystemRoleHeadcountLock(this.dataSource, async (manager) => {
      // Один запрос вместо двух последовательных COUNT (/simplify efficiency finding) — считает
      // держателей этой роли и держателей остальных системных ролей одновременно через FILTER,
      // сокращая время удержания advisory-лока.
      const counts = await manager
        .createQueryBuilder(User, 'user')
        .innerJoin('user.role', 'role')
        .select('COUNT(*) FILTER (WHERE role.id = :roleId)', 'thisRole')
        .addSelect(
          'COUNT(*) FILTER (WHERE role.is_system = true AND role.id != :roleId)',
          'elsewhere',
        )
        .where('user.is_active = true')
        .setParameter('roleId', role.id)
        .getRawOne<{ thisRole: string; elsewhere: string }>();

      const hasActiveHolders = Number(counts?.thisRole ?? 0) > 0;
      const remainingElsewhere = Number(counts?.elsewhere ?? 0);

      if (hasActiveHolders && remainingElsewhere === 0) return 'blocked';

      return manager.save(role);
    });
  }
}
