import { getRepositoryToken } from '@nestjs/typeorm';
import { TestingModule } from '@nestjs/testing';
import { Repository } from 'typeorm';
import { Role } from '../../src/modules/roles/domain/role.entity';

// users.role_id теперь FK на roles, не enum-строка — 4 легаси-роли сидятся миграцией
// AddRolesAndPermissions с теми же кодами, что и старый enum (EXPANSION_TASKS.md §1.7), поэтому
// резолв по коду всегда находит нужную роль в тестовой БД после runTestMigrations(). Принимает
// moduleRef напрямую — вызывающему не нужно отдельно объявлять и получать Repository<Role>
// самому (было 6 копий одного и того же бойлерплейта в разных e2e-файлах).
export function resolveRoleId(
  moduleRef: TestingModule,
  code: string,
): Promise<number> {
  const rolesRepo = moduleRef.get<Repository<Role>>(getRepositoryToken(Role));
  return rolesRepo.findOneByOrFail({ code }).then((role) => role.id);
}
