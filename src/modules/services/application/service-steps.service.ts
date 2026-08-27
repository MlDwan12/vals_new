import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  buildPaginatedResult,
  PaginatedResult,
} from '../../../core/pagination/paginated-result.interface';
import { isUniqueViolation } from '../../../core/persistence/postgres-error.util';
import { ServicesRepository } from '../infrastructure/services.repository';
import { ServiceStep } from '../domain/service-step.entity';
import { CreateServiceStepDto } from '../dto/create-service-step.dto';
import { ServiceStepResponseDto } from '../dto/service-step-response.dto';
import { UpdateServiceStepDto } from '../dto/update-service-step.dto';
import { ServiceStepsRepository } from '../infrastructure/service-steps.repository';

@Injectable()
export class ServiceStepsService {
  constructor(
    private readonly serviceStepsRepository: ServiceStepsRepository,
    private readonly servicesRepository: ServicesRepository,
  ) {}

  async create(dto: CreateServiceStepDto): Promise<ServiceStepResponseDto> {
    await this.assertServiceExists(dto.serviceId);
    try {
      const step = await this.serviceStepsRepository.create(dto);
      return ServiceStepResponseDto.fromEntity(step);
    } catch (error) {
      throw this.mapStepConflict(error);
    }
  }

  async update(
    id: number,
    dto: UpdateServiceStepDto,
  ): Promise<ServiceStepResponseDto> {
    if (dto.serviceId !== undefined) {
      await this.assertServiceExists(dto.serviceId);
    }

    try {
      const updated = await this.serviceStepsRepository.update(id, dto);
      if (!updated) {
        throw new NotFoundException(`Этап с ID ${id} не найден`);
      }
      return ServiceStepResponseDto.fromEntity(updated);
    } catch (error) {
      throw this.mapStepConflict(error);
    }
  }

  async remove(id: number): Promise<void> {
    await this.findEntityByIdOrFail(id);
    await this.serviceStepsRepository.remove(id);
  }

  async findById(id: number): Promise<ServiceStepResponseDto> {
    return ServiceStepResponseDto.fromEntity(
      await this.findEntityByIdOrFail(id),
    );
  }

  async paginate(
    page: number,
    limit: number,
  ): Promise<PaginatedResult<ServiceStepResponseDto>> {
    const [items, total] = await this.serviceStepsRepository.findAndCount(
      page,
      limit,
    );
    return buildPaginatedResult(
      items.map((item) => ServiceStepResponseDto.fromEntity(item)),
      total,
      page,
      limit,
    );
  }

  private async findEntityByIdOrFail(id: number): Promise<ServiceStep> {
    const step = await this.serviceStepsRepository.findById(id);
    if (!step) {
      throw new NotFoundException(`Этап с ID ${id} не найден`);
    }
    return step;
  }

  private async assertServiceExists(serviceId: number): Promise<void> {
    const [service] = await this.servicesRepository.findByIds([serviceId]);
    if (!service) {
      throw new BadRequestException(`Услуга с ID ${serviceId} не найдена`);
    }
  }

  // UNIQUE(service_id, step) — единственное место в content-модулях без такой защиты (Б6,
  // независимый аудит 2026-08-21): переупорядочивание шагов услуги (например, swap двух шагов)
  // раньше давало сырой 500 вместо понятного 4xx.
  private mapStepConflict(error: unknown): unknown {
    if (isUniqueViolation(error)) {
      return new ConflictException(
        'Этап с таким номером уже существует у этой услуги',
      );
    }
    return error;
  }
}
