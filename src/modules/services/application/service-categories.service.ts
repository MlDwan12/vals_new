import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { isForeignKeyViolation } from '../../../core/persistence/postgres-error.util';
import {
  buildPaginatedResult,
  PaginatedResult,
} from '../../../core/pagination/paginated-result.interface';
import { ServiceCategory } from '../domain/service-category.entity';
import { CreateServiceCategoryDto } from '../dto/create-service-category.dto';
import { ServiceCategoryResponseDto } from '../dto/service-category-response.dto';
import { UpdateServiceCategoryDto } from '../dto/update-service-category.dto';
import { ServiceCategoriesRepository } from '../infrastructure/service-categories.repository';

@Injectable()
export class ServiceCategoriesService {
  constructor(
    private readonly serviceCategoriesRepository: ServiceCategoriesRepository,
  ) {}

  async create(
    dto: CreateServiceCategoryDto,
  ): Promise<ServiceCategoryResponseDto> {
    const category = await this.serviceCategoriesRepository.create(dto);
    return ServiceCategoryResponseDto.fromEntity(category);
  }

  async update(
    id: number,
    dto: UpdateServiceCategoryDto,
  ): Promise<ServiceCategoryResponseDto> {
    const updated = await this.serviceCategoriesRepository.update(id, dto);
    if (!updated) {
      throw new NotFoundException(`Категория с ID ${id} не найдена`);
    }
    return ServiceCategoryResponseDto.fromEntity(updated);
  }

  // Удаление блокируется на уровне FK (services.category_id — ON DELETE RESTRICT) — здесь только
  // понятное сообщение вместо сырой ошибки Postgres.
  async remove(id: number): Promise<void> {
    await this.findEntityByIdOrFail(id);

    try {
      await this.serviceCategoriesRepository.remove(id);
    } catch (error) {
      if (isForeignKeyViolation(error)) {
        throw new BadRequestException(
          'Нельзя удалить категорию — в ней есть услуги. Сначала перенесите или удалите услуги.',
        );
      }
      throw error;
    }
  }

  async findById(id: number): Promise<ServiceCategoryResponseDto> {
    return ServiceCategoryResponseDto.fromEntity(
      await this.findEntityByIdOrFail(id),
    );
  }

  async findAll(): Promise<ServiceCategoryResponseDto[]> {
    const categories = await this.serviceCategoriesRepository.findAll();
    return categories.map((category) =>
      ServiceCategoryResponseDto.fromEntity(category),
    );
  }

  async paginate(
    page: number,
    limit: number,
  ): Promise<PaginatedResult<ServiceCategoryResponseDto>> {
    const [items, total] = await this.serviceCategoriesRepository.findAndCount(
      page,
      limit,
    );
    return buildPaginatedResult(
      items.map((item) => ServiceCategoryResponseDto.fromEntity(item)),
      total,
      page,
      limit,
    );
  }

  private async findEntityByIdOrFail(id: number): Promise<ServiceCategory> {
    const category = await this.serviceCategoriesRepository.findById(id);
    if (!category) {
      throw new NotFoundException(`Категория с ID ${id} не найдена`);
    }
    return category;
  }
}
