import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Permission } from '../domain/permission.entity';
import { Role } from '../domain/role.entity';

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
}
