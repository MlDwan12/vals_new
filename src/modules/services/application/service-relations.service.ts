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
import {
  getViolatedConstraint,
  isForeignKeyViolation,
  isUniqueViolation,
} from '../../../core/persistence/postgres-error.util';
import { resolveRequiredEntitiesByIds } from '../../../core/persistence/resolve-entities-by-ids.util';
import { ServicesRepository } from '../infrastructure/services.repository';
import { ServiceRelation } from '../domain/service-relation.entity';
import { CreateServiceRelationDto } from '../dto/create-service-relation.dto';
import { ServiceRelationResponseDto } from '../dto/service-relation-response.dto';
import { UpdateServiceRelationDto } from '../dto/update-service-relation.dto';
import { ServiceRelationsRepository } from '../infrastructure/service-relations.repository';

const PAIR_UNIQUE_INDEX = 'IDX_service_relations_pair_unique';
const ORDER_UNIQUE_INDEX = 'IDX_service_relations_order_unique';

@Injectable()
export class ServiceRelationsService {
  constructor(
    private readonly serviceRelationsRepository: ServiceRelationsRepository,
    private readonly servicesRepository: ServicesRepository,
  ) {}

  async create(
    dto: CreateServiceRelationDto,
  ): Promise<ServiceRelationResponseDto> {
    this.assertNotSelfRelation(dto.serviceId, dto.relatedServiceId);
    await this.assertServicesExist(dto.serviceId, dto.relatedServiceId);
    try {
      const relation = await this.serviceRelationsRepository.create(dto);
      return ServiceRelationResponseDto.fromEntity(relation);
    } catch (error) {
      throw this.mapConflict(error);
    }
  }

  async update(
    id: number,
    dto: UpdateServiceRelationDto,
  ): Promise<ServiceRelationResponseDto> {
    const existing = await this.findEntityByIdOrFail(id);
    const serviceId = dto.serviceId ?? existing.serviceId;
    const relatedServiceId = dto.relatedServiceId ?? existing.relatedServiceId;
    this.assertNotSelfRelation(serviceId, relatedServiceId);
    if (dto.serviceId !== undefined || dto.relatedServiceId !== undefined) {
      await this.assertServicesExist(serviceId, relatedServiceId);
    }

    try {
      const updated = await this.serviceRelationsRepository.update(id, dto);
      if (!updated) {
        throw new NotFoundException(`Связь услуг с ID ${id} не найдена`);
      }
      return ServiceRelationResponseDto.fromEntity(updated);
    } catch (error) {
      throw this.mapConflict(error);
    }
  }

  async remove(id: number): Promise<void> {
    await this.findEntityByIdOrFail(id);
    await this.serviceRelationsRepository.remove(id);
  }

  async findById(id: number): Promise<ServiceRelationResponseDto> {
    return ServiceRelationResponseDto.fromEntity(
      await this.findEntityByIdOrFail(id),
    );
  }

  async paginate(
    page: number,
    limit: number,
  ): Promise<PaginatedResult<ServiceRelationResponseDto>> {
    const [items, total] = await this.serviceRelationsRepository.findAndCount(
      page,
      limit,
    );
    return buildPaginatedResult(
      items.map((item) => ServiceRelationResponseDto.fromEntity(item)),
      total,
      page,
      limit,
    );
  }

  private async findEntityByIdOrFail(id: number): Promise<ServiceRelation> {
    const relation = await this.serviceRelationsRepository.findById(id);
    if (!relation) {
      throw new NotFoundException(`Связь услуг с ID ${id} не найдена`);
    }
    return relation;
  }

  private assertNotSelfRelation(
    serviceId: number,
    relatedServiceId: number,
  ): void {
    if (serviceId === relatedServiceId) {
      throw new BadRequestException('Услуга не может ссылаться сама на себя');
    }
  }

  // Переиспользует общий resolveRequiredEntitiesByIds (case review: раньше был ручной
  // fetch+diff+throw, дублирующий его логику) — create()/update() дальше пишут serviceId/
  // relatedServiceId как скаляры, найденные сущности не нужны. assertNotSelfRelation выше уже
  // гарантирует serviceId !== relatedServiceId, так что "пустой список"-ветка утилиты (для
  // необязательного случая) сюда не относится — два ID всегда различны и всегда заданы.
  private assertServicesExist(
    serviceId: number,
    relatedServiceId: number,
  ): Promise<unknown> {
    return resolveRequiredEntitiesByIds(
      [serviceId, relatedServiceId],
      (ids) => this.servicesRepository.findByIds(ids),
      'Услуги',
      'serviceId/relatedServiceId',
    );
  }

  // Два разных composite-unique на таблице (пара service+relatedService, и service+order) —
  // разные сообщения для разных ошибок пользователя, тот же приём, что tags.service.ts
  // (mapSlugConflict): сначала isUniqueViolation(error), и только внутри — какой именно constraint
  // через getViolatedConstraint (не наоборот — code review, /simplify).
  private mapConflict(error: unknown): unknown {
    if (isUniqueViolation(error)) {
      const constraint = getViolatedConstraint(error);
      if (constraint === PAIR_UNIQUE_INDEX) {
        return new ConflictException(
          'Эта услуга уже связана с указанной связанной услугой',
        );
      }
      if (constraint === ORDER_UNIQUE_INDEX) {
        return new ConflictException(
          'Связь с таким порядковым номером уже существует у этой услуги',
        );
      }
    }
    // TOCTOU: одна из услуг могла быть удалена между assertServicesExist выше и этим
    // INSERT/UPDATE (оба FK — CASCADE, security-audit-2026-08-31.md №12) — без перехвата голый
    // QueryFailedError уходит наружу как 500.
    if (isForeignKeyViolation(error)) {
      return new BadRequestException(
        'Одна из указанных услуг была удалена — повторите с актуальным ID',
      );
    }
    return error;
  }
}
