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
import { ContentHtmlService } from '../../../core/content/content-html.service';

@Injectable()
export class EmployeesService {
  constructor(
    private readonly employeesRepository: EmployeesRepository,
    private readonly contentHtmlService: ContentHtmlService,
  ) {}

  async create(dto: CreateEmployeeDto): Promise<EmployeeResponseDto> {
    try {
      const employee = await this.employeesRepository.create({
        ...dto,
        // HTML биографии собирает бек — присланный клиентом остаётся запасным (переходный период
        // среза X). Без bio нечего и собирать: у сотрудника биография необязательна.
        bioHtml:
          dto.bio === undefined
            ? undefined
            : this.contentHtmlService.render(dto.bio, {
                clientHtml: dto.bioHtml,
              }),
      });
      return EmployeeResponseDto.fromEntity(employee);
    } catch (error) {
      throw this.mapSlugConflict(error);
    }
  }

  async update(
    id: number,
    dto: UpdateEmployeeDto,
  ): Promise<EmployeeResponseDto> {
    // Сотрудник читается до правки ради прежнего HTML: он третий уровень запасного варианта, если
    // сборка упадёт, а клиент HTML не прислал. Заодно 404 отвечается до попытки сохранения.
    const existing = await this.employeesRepository.findById(id);
    if (!existing) {
      throw new NotFoundException(`Сотрудник с ID ${id} не найден`);
    }

    try {
      const updated = await this.employeesRepository.update(id, {
        ...dto,
        bioHtml:
          dto.bio === undefined
            ? undefined
            : this.contentHtmlService.render(dto.bio, {
                clientHtml: dto.bioHtml,
                previousHtml: existing.bioHtml,
              }),
      });
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
