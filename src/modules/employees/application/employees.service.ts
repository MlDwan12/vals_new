import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  isForeignKeyViolation,
  isUniqueViolation,
} from '../../../core/persistence/postgres-error.util';
import {
  buildPaginatedResult,
  PaginatedResult,
} from '../../../core/pagination/paginated-result.interface';
import { CreateEmployeeDto } from '../dto/create-employee.dto';
import { Employee } from '../domain/employee.entity';
import { EmployeeMainInfoDto } from '../dto/employee-main-info.dto';
import { EmployeeResponseDto } from '../dto/employee-response.dto';
import { UpdateEmployeeDto } from '../dto/update-employee.dto';
import { EmployeesRepository } from '../infrastructure/employees.repository';

@Injectable()
export class EmployeesService {
  constructor(private readonly employeesRepository: EmployeesRepository) {}

  async create(dto: CreateEmployeeDto): Promise<EmployeeResponseDto> {
    try {
      const employee = await this.employeesRepository.create(dto);
      return EmployeeResponseDto.fromEntity(employee);
    } catch (error) {
      throw this.mapSlugConflict(error);
    }
  }

  async update(
    id: number,
    dto: UpdateEmployeeDto,
  ): Promise<EmployeeResponseDto> {
    try {
      const updated = await this.employeesRepository.update(id, dto);
      if (!updated) {
        throw new NotFoundException(`Сотрудник с ID ${id} не найден`);
      }
      return EmployeeResponseDto.fromEntity(updated);
    } catch (error) {
      throw this.mapSlugConflict(error);
    }
  }

  // Удаление блокируется на уровне FK (article_authors/case_authors/news_authors — ON DELETE NO
  // ACTION) — здесь только понятное сообщение вместо сырой ошибки Postgres. Текст обновлён при
  // добавлении news_authors (задача 3 EXPANSION_TASKS.md) — тот же пробел, что был в
  // TagsService.remove до фикса той же сессии (code-review high, N-2).
  async remove(id: number): Promise<void> {
    await this.findEntityByIdOrFail(id);

    try {
      await this.employeesRepository.remove(id);
    } catch (error) {
      if (isForeignKeyViolation(error)) {
        throw new BadRequestException(
          'Нельзя удалить сотрудника — у него есть статьи, кейсы или новости. Сначала снимите привязку или скройте сотрудника (isVisible: false).',
        );
      }
      throw error;
    }
  }

  async findById(id: number): Promise<EmployeeResponseDto> {
    return EmployeeResponseDto.fromEntity(await this.findEntityByIdOrFail(id));
  }

  async paginate(
    page: number,
    limit: number,
  ): Promise<PaginatedResult<EmployeeMainInfoDto>> {
    const [items, total] = await this.employeesRepository.findAndCount(
      page,
      limit,
    );
    return buildPaginatedResult(
      items.map((item) => EmployeeMainInfoDto.fromEntity(item)),
      total,
      page,
      limit,
    );
  }

  async findPublishedList(): Promise<EmployeeMainInfoDto[]> {
    const employees = await this.employeesRepository.findPublishedList();
    return employees.map((employee) =>
      EmployeeMainInfoDto.fromEntity(employee),
    );
  }

  async findPublishedBySlugOrFail(slug: string): Promise<EmployeeResponseDto> {
    const employee = await this.employeesRepository.findBySlugPublished(slug);
    if (!employee) {
      throw new NotFoundException(`Сотрудник со slug "${slug}" не найден`);
    }
    return EmployeeResponseDto.fromEntity(employee);
  }

  private async findEntityByIdOrFail(id: number): Promise<Employee> {
    const employee = await this.employeesRepository.findById(id);
    if (!employee) {
      throw new NotFoundException(`Сотрудник с ID ${id} не найден`);
    }
    return employee;
  }

  private mapSlugConflict(error: unknown): unknown {
    if (isUniqueViolation(error)) {
      return new ConflictException('Сотрудник с таким slug уже существует');
    }
    return error;
  }
}
