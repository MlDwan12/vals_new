import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Role } from '../../../core/enums/role.enum';
import { User } from '../domain/user.entity';

interface CreateUserRecord {
  username: string;
  password: string;
  role: Role;
}

interface UpdateUserRecord {
  username?: string;
  password?: string;
  isActive?: boolean;
}

@Injectable()
export class UsersRepository {
  constructor(
    @InjectRepository(User) private readonly repo: Repository<User>,
  ) {}

  findByUsernameForAuth(username: string): Promise<User | null> {
    return this.repo.findOne({
      where: { username },
      select: {
        id: true,
        username: true,
        password: true,
        role: true,
        isActive: true,
      },
    });
  }

  findByUsername(username: string): Promise<User | null> {
    return this.repo.findOne({ where: { username } });
  }

  findById(id: number): Promise<User | null> {
    return this.repo.findOne({ where: { id } });
  }

  async findAndCount(page: number, limit: number): Promise<[User[], number]> {
    return this.repo.findAndCount({
      order: { id: 'ASC' },
      skip: (page - 1) * limit,
      take: limit,
    });
  }

  create(data: CreateUserRecord): Promise<User> {
    return this.repo.save(this.repo.create(data));
  }

  async update(id: number, patch: UpdateUserRecord): Promise<User | null> {
    await this.repo.update(id, patch);
    return this.findById(id);
  }

  async remove(id: number): Promise<void> {
    await this.repo.delete(id);
  }
}
