import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PinoLogger } from 'nestjs-pino';
import { Role } from '../../../core/enums/role.enum';
import {
  buildPaginatedResult,
  PaginatedResult,
} from '../../../core/pagination/paginated-result.interface';
import { isUniqueViolation } from '../../../core/persistence/postgres-error.util';
import { UpdateUserDto } from '../dto/update-user.dto';
import { UserResponseDto } from '../dto/user-response.dto';
import { User } from '../domain/user.entity';
import { UsersRepository } from '../infrastructure/users.repository';

const BCRYPT_COST = 12;

@Injectable()
export class UsersService {
  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(UsersService.name);
  }

  findForAuth(username: string): Promise<User | null> {
    return this.usersRepository.findByUsernameForAuth(
      normalizeUsername(username),
    );
  }

  // Единственный источник маппинга в DTO — контроллер раньше вызывал UserResponseDto.fromEntity()
  // сам (единственное исключение из паттерна проекта среди ~18 admin/public контроллеров, где DTO
  // всегда собирает сервис). AuthService.getMe переиспользует этот метод для /auth/me — там нужны
  // только username/role, которые есть и в DTO, отдельного метода на "сырую" сущность не требуется.
  async findById(id: number): Promise<UserResponseDto> {
    return UserResponseDto.fromEntity(await this.findEntityById(id));
  }

  async paginate(
    page: number,
    limit: number,
  ): Promise<PaginatedResult<UserResponseDto>> {
    const [items, total] = await this.usersRepository.findAndCount(page, limit);
    return buildPaginatedResult(
      items.map((user) => UserResponseDto.fromEntity(user)),
      total,
      page,
      limit,
    );
  }

  private async findEntityById(id: number): Promise<User> {
    const user = await this.usersRepository.findById(id);
    if (!user) {
      throw new NotFoundException('Пользователь не найден');
    }
    return user;
  }

  async createWithRole(
    username: string,
    password: string,
    role: Role,
  ): Promise<void> {
    const normalizedUsername = normalizeUsername(username);

    const existing =
      await this.usersRepository.findByUsername(normalizedUsername);
    if (existing) {
      throw new ConflictException('Пользователь с таким именем уже существует');
    }

    const passwordHash = await this.hashPassword(password);

    try {
      await this.usersRepository.create({
        username: normalizedUsername,
        password: passwordHash,
        role,
      });
    } catch (error: unknown) {
      if (isUniqueViolation(error)) {
        throw new ConflictException(
          'Пользователь с таким именем уже существует',
        );
      }
      this.logger.error(
        { err: error, username: normalizedUsername, role },
        'Failed to save user',
      );
      throw new InternalServerErrorException('Не удалось создать пользователя');
    }
  }

  async update(id: number, dto: UpdateUserDto): Promise<UserResponseDto> {
    await this.findEntityById(id);

    const patch: { username?: string; password?: string; isActive?: boolean } =
      {};

    if (dto.username !== undefined) {
      patch.username = normalizeUsername(dto.username);
    }
    if (dto.password !== undefined) {
      patch.password = await this.hashPassword(dto.password);
    }
    if (dto.isActive !== undefined) {
      patch.isActive = dto.isActive;
    }

    try {
      const updated = await this.usersRepository.update(id, patch);
      if (!updated) {
        throw new NotFoundException('Пользователь не найден');
      }
      return UserResponseDto.fromEntity(updated);
    } catch (error: unknown) {
      if (isUniqueViolation(error)) {
        throw new ConflictException(
          'Пользователь с таким именем уже существует',
        );
      }
      throw error;
    }
  }

  async remove(id: number): Promise<void> {
    await this.findEntityById(id);
    await this.usersRepository.remove(id);
  }

  private async hashPassword(password: string): Promise<string> {
    try {
      return await bcrypt.hash(password, BCRYPT_COST);
    } catch (error: unknown) {
      this.logger.error({ err: error }, 'Failed to hash user password');
      throw new InternalServerErrorException(
        'Не удалось обработать пароль пользователя',
      );
    }
  }
}

// Логин нормализуется одинаково при создании и обновлении (ТЗ §5) — раньше нормализация
// была только при создании, из-за чего переименование ломало вход.
function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}
