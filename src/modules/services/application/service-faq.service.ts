import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  buildPaginatedResult,
  PaginatedResult,
} from '../../../core/pagination/paginated-result.interface';
import { ServicesRepository } from '../infrastructure/services.repository';
import { ServiceFaq } from '../domain/service-faq.entity';
import { CreateServiceFaqDto } from '../dto/create-service-faq.dto';
import { ServiceFaqResponseDto } from '../dto/service-faq-response.dto';
import { UpdateServiceFaqDto } from '../dto/update-service-faq.dto';
import { ServiceFaqRepository } from '../infrastructure/service-faq.repository';

@Injectable()
export class ServiceFaqService {
  constructor(
    private readonly serviceFaqRepository: ServiceFaqRepository,
    private readonly servicesRepository: ServicesRepository,
  ) {}

  async create(dto: CreateServiceFaqDto): Promise<ServiceFaqResponseDto> {
    await this.assertServiceExists(dto.serviceId);
    const faq = await this.serviceFaqRepository.create(dto);
    return ServiceFaqResponseDto.fromEntity(faq);
  }

  async update(
    id: number,
    dto: UpdateServiceFaqDto,
  ): Promise<ServiceFaqResponseDto> {
    if (dto.serviceId !== undefined) {
      await this.assertServiceExists(dto.serviceId);
    }

    const updated = await this.serviceFaqRepository.update(id, dto);
    if (!updated) {
      throw new NotFoundException(`FAQ с ID ${id} не найдено`);
    }
    return ServiceFaqResponseDto.fromEntity(updated);
  }

  async remove(id: number): Promise<void> {
    await this.findEntityByIdOrFail(id);
    await this.serviceFaqRepository.remove(id);
  }

  async findById(id: number): Promise<ServiceFaqResponseDto> {
    return ServiceFaqResponseDto.fromEntity(
      await this.findEntityByIdOrFail(id),
    );
  }

  async paginate(
    page: number,
    limit: number,
  ): Promise<PaginatedResult<ServiceFaqResponseDto>> {
    const [items, total] = await this.serviceFaqRepository.findAndCount(
      page,
      limit,
    );
    return buildPaginatedResult(
      items.map((item) => ServiceFaqResponseDto.fromEntity(item)),
      total,
      page,
      limit,
    );
  }

  private async findEntityByIdOrFail(id: number): Promise<ServiceFaq> {
    const faq = await this.serviceFaqRepository.findById(id);
    if (!faq) {
      throw new NotFoundException(`FAQ с ID ${id} не найдено`);
    }
    return faq;
  }

  private async assertServiceExists(serviceId: number): Promise<void> {
    const [service] = await this.servicesRepository.findByIds([serviceId]);
    if (!service) {
      throw new BadRequestException(`Услуга с ID ${serviceId} не найдена`);
    }
  }
}
