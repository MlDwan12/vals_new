import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { isEmptyPatch } from '../../../core/persistence/is-empty-patch.util';
import {
  getViolatedConstraint,
  isForeignKeyViolation,
  isUniqueViolation,
} from '../../../core/persistence/postgres-error.util';
import { CreateTagDto } from '../dto/create-tag.dto';
import { TagResponseDto } from '../dto/tag-response.dto';
import { TagWithCountsResponseDto } from '../dto/tag-with-counts-response.dto';
import { UpdateTagDto } from '../dto/update-tag.dto';
import { Tag } from '../domain/tag.entity';
import { TagsRepository } from '../infrastructure/tags.repository';
import { transliterate } from '../util/transliterate.util';

// Имя индекса из миграции AddTagNameUnique1787209807011 — используется, чтобы отличить нарушение
// уникальности name от slug в mapSlugConflict ниже.
const TAG_NAME_UNIQUE_INDEX = 'IDX_tags_name_unique';

@Injectable()
export class TagsService {
  constructor(private readonly tagsRepository: TagsRepository) {}

  // Идемпотентно по имени (creatable-комбобокс в форме статьи/кейса не должен плодить дубли тега
  // с тем же названием при повторном сабмите) + slug генерируется на бэке, не принимается извне
  // (контракт старого API — CreateTagDto не содержал slug вовсе). Проверка "существует ли уже" —
  // check-then-act, не атомарно сама по себе: настоящую идемпотентность под гонкой (два
  // конкурентных сабмита с одним именем) даёт unique-индекс на tags.name в БД (как в старом
  // vals_api) — при его нарушении просто отдаём тег, который успел создать конкурент, вместо 409
  // (code review).
  async create(dto: CreateTagDto): Promise<TagResponseDto> {
    const name = dto.name.trim();
    const existing = await this.tagsRepository.findByNameCI(name);
    if (existing) {
      return TagResponseDto.fromEntity(existing);
    }

    try {
      const slug = await this.generateUniqueSlug(name);
      const tag = await this.tagsRepository.create({
        name,
        slug,
        priority: dto.priority ?? 0,
      });
      return TagResponseDto.fromEntity(tag);
    } catch (error) {
      if (isUniqueViolation(error)) {
        const raceWinner = await this.tagsRepository.findByNameCI(name);
        if (raceWinner) {
          return TagResponseDto.fromEntity(raceWinner);
        }
      }
      throw this.mapSlugConflict(error);
    }
  }

  async update(id: number, dto: UpdateTagDto): Promise<TagResponseDto> {
    const tag = await this.findEntityByIdOrFail(id);
    const patch: { name?: string; slug?: string; priority?: number } = {};

    if (dto.name !== undefined) {
      const name = dto.name.trim();
      if (name !== tag.name) {
        // create() идемпотентен по имени через findByNameCI (регистронезависимо) — update() эту
        // проверку не наследовал (round-3 review): переименование в имя, отличающееся только
        // регистром от существующего тега, проходило молча, БД-индекс IDX_tags_name_unique
        // регистрозависимый и не ловит. duplicate.id !== tag.id разрешает смену регистра
        // собственного имени (например «Скидка» → «скидка»), не только чужого. Как и в create(),
        // это check-then-act, не атомарно самому по себе — под гонкой двух конкурентных
        // переименований в один и тот же регистронезависимый вариант спасает только БД-индекс, и
        // только если итоговые имена совпадают байт-в-байт (тот же принятый разменный компромисс,
        // что и в create()).
        const duplicate = await this.tagsRepository.findByNameCI(name);
        if (duplicate && duplicate.id !== tag.id) {
          throw new ConflictException('Тег с таким именем уже существует');
        }
        patch.name = name;
        patch.slug = await this.generateUniqueSlug(name, tag.id);
      }
    }
    if (dto.priority !== undefined) {
      patch.priority = dto.priority;
    }

    try {
      const updated = isEmptyPatch(patch)
        ? tag
        : await this.tagsRepository.update(id, patch);
      if (!updated) {
        throw new NotFoundException(`Тег с ID ${id} не найден`);
      }
      return TagResponseDto.fromEntity(updated);
    } catch (error) {
      throw this.mapSlugConflict(error);
    }
  }

  private async generateUniqueSlug(
    name: string,
    excludeId?: number,
  ): Promise<string> {
    const base = transliterate(name) || 'tag';
    let candidate = base;
    let suffix = 2;

    while (await this.tagsRepository.existsBySlug(candidate, excludeId)) {
      candidate = `${base}-${suffix++}`;
    }

    return candidate;
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

  // У tags, в отличие от articles/cases/services/employees, ДВА unique-индекса (slug и name, см.
  // AddTagNameUnique1787209807011) — единственное сообщение "slug уже существует" стало враньём
  // при нарушении по имени (round-3 review). getViolatedConstraint различает по имени
  // нарушенного индекса; остальные 4 домена с этим же паттерном mapSlugConflict не трогаю — у них
  // ровно один unique-индекс, сообщение всегда верно.
  private mapSlugConflict(error: unknown): unknown {
    if (isUniqueViolation(error)) {
      if (getViolatedConstraint(error) === TAG_NAME_UNIQUE_INDEX) {
        return new ConflictException('Тег с таким именем уже существует');
      }
      return new ConflictException('Тег с таким slug уже существует');
    }
    return error;
  }
}
