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
import { CreateTagDto } from '../dto/create-tag.dto';
import { TagResponseDto } from '../dto/tag-response.dto';
import { TagWithCountsResponseDto } from '../dto/tag-with-counts-response.dto';
import { UpdateTagDto } from '../dto/update-tag.dto';
import { Tag } from '../domain/tag.entity';
import { TagsRepository } from '../infrastructure/tags.repository';

@Injectable()
export class TagsService {
  constructor(private readonly tagsRepository: TagsRepository) {}

  async create(dto: CreateTagDto): Promise<TagResponseDto> {
    try {
      const tag = await this.tagsRepository.create(dto);
      return TagResponseDto.fromEntity(tag);
    } catch (error) {
      throw this.mapSlugConflict(error);
    }
  }

  async update(id: number, dto: UpdateTagDto): Promise<TagResponseDto> {
    try {
      const updated = await this.tagsRepository.update(id, dto);
      if (!updated) {
        throw new NotFoundException(`Тег с ID ${id} не найден`);
      }
      return TagResponseDto.fromEntity(updated);
    } catch (error) {
      throw this.mapSlugConflict(error);
    }
  }

  // tag_id в article_tags/case_tags — ON DELETE NO ACTION (проверено на реальной миграции), удаление
  // используемого тега падает FK-нарушением — здесь только понятное сообщение вместо сырой ошибки Postgres.
  async remove(id: number): Promise<void> {
    await this.findEntityByIdOrFail(id);

    try {
      await this.tagsRepository.remove(id);
    } catch (error) {
      if (isForeignKeyViolation(error)) {
        throw new BadRequestException(
          'Нельзя удалить тег — он используется в статьях или кейсах. Сначала уберите тег из материалов.',
        );
      }
      throw error;
    }
  }

  async findById(id: number): Promise<TagResponseDto> {
    return TagResponseDto.fromEntity(await this.findEntityByIdOrFail(id));
  }

  async findAllWithCounts(): Promise<TagWithCountsResponseDto[]> {
    const rows = await this.tagsRepository.findAllWithCounts();
    return rows.map((row) => TagWithCountsResponseDto.fromRow(row));
  }

  async findPublicList(type?: 'article' | 'case'): Promise<TagResponseDto[]> {
    const tags = await this.tagsRepository.findPublicList(type);
    return tags.map((tag) => TagResponseDto.fromEntity(tag));
  }

  private async findEntityByIdOrFail(id: number): Promise<Tag> {
    const tag = await this.tagsRepository.findById(id);
    if (!tag) {
      throw new NotFoundException(`Тег с ID ${id} не найден`);
    }
    return tag;
  }

  private mapSlugConflict(error: unknown): unknown {
    if (isUniqueViolation(error)) {
      return new ConflictException('Тег с таким slug уже существует');
    }
    return error;
  }
}
