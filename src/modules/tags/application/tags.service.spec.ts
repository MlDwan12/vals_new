import { ConflictException } from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import { Tag } from '../domain/tag.entity';
import { TagsRepository } from '../infrastructure/tags.repository';
import { TagsService } from './tags.service';

class FakeDriverError extends Error {
  code?: string;
  constraint?: string;
}

function uniqueViolation(constraint: string): QueryFailedError {
  const driverError = new FakeDriverError('duplicate key value');
  Object.assign(driverError, { code: '23505', constraint });
  return new QueryFailedError('UPDATE "tags" ...', [], driverError);
}

function buildTag(overrides: Partial<Tag> = {}): Tag {
  return {
    id: 1,
    name: 'Скидка',
    slug: 'skidka',
    priority: 0,
    articles: [],
    cases: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

// updateMock — отдельная переменная, не repo.update (@typescript-eslint/unbound-method:
// bare-ссылка на метод объекта, переданная в expect(), теряет привязку this — тот же фикс, что
// уже применялся в lead-delivery.scheduler.spec.ts).
function buildRepository(): {
  repo: jest.Mocked<TagsRepository>;
  updateMock: jest.Mock;
} {
  const updateMock = jest.fn();
  const repo = {
    findByIds: jest.fn(),
    findById: jest.fn(),
    findByNameCI: jest.fn(),
    existsBySlug: jest.fn().mockResolvedValue(false),
    create: jest.fn(),
    update: updateMock,
    remove: jest.fn(),
    findAllWithCounts: jest.fn(),
    findPublicList: jest.fn(),
  } as unknown as jest.Mocked<TagsRepository>;
  return { repo, updateMock };
}

// round-3 review: update() не наследовал регистронезависимую проверку дубля имени от create()
// (findByNameCI), а mapSlugConflict отдавал "slug уже существует" даже при нарушении уникальности
// name — у tags, в отличие от остальных 4 доменов с тем же паттерном, ДВА unique-индекса.
describe('TagsService', () => {
  describe('update — дубликат имени', () => {
    it('отклоняет переименование в имя, отличающееся только регистром от ЧУЖОГО тега', async () => {
      const { repo, updateMock } = buildRepository();
      const service = new TagsService(repo);
      const tag = buildTag({ id: 1, name: 'Акция' });
      const other = buildTag({ id: 2, name: 'скидка' });
      repo.findById.mockResolvedValue(tag);
      repo.findByNameCI.mockResolvedValue(other);

      await expect(
        service.update(1, { name: 'Скидка' }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(updateMock).not.toHaveBeenCalled();
    });

    it('разрешает смену регистра СОБСТВЕННОГО имени (не считает конфликтом самого себя)', async () => {
      const { repo, updateMock } = buildRepository();
      const service = new TagsService(repo);
      const tag = buildTag({ id: 1, name: 'Скидка', slug: 'skidka' });
      repo.findById.mockResolvedValue(tag);
      repo.findByNameCI.mockResolvedValue(tag); // ILike матчит саму себя
      repo.update.mockResolvedValue(buildTag({ id: 1, name: 'скидка' }));

      await expect(
        service.update(1, { name: 'скидка' }),
      ).resolves.toMatchObject({ name: 'скидка' });
      expect(updateMock).toHaveBeenCalledWith(
        1,
        expect.objectContaining({ name: 'скидка' }),
      );
    });

    it('без коллизии — переименование проходит как обычно', async () => {
      const { repo } = buildRepository();
      const service = new TagsService(repo);
      const tag = buildTag({ id: 1, name: 'Акция' });
      repo.findById.mockResolvedValue(tag);
      repo.findByNameCI.mockResolvedValue(null);
      repo.update.mockResolvedValue(buildTag({ id: 1, name: 'Новое имя' }));

      await expect(
        service.update(1, { name: 'Новое имя' }),
      ).resolves.toMatchObject({ name: 'Новое имя' });
    });
  });

  describe('mapSlugConflict — различает name и slug', () => {
    it('нарушение IDX_tags_name_unique -> сообщение про имя', async () => {
      const { repo } = buildRepository();
      const service = new TagsService(repo);
      const tag = buildTag({ id: 1, name: 'Акция' });
      repo.findById.mockResolvedValue(tag);
      repo.findByNameCI.mockResolvedValue(null); // проверка в update() не поймала — гонка
      repo.update.mockRejectedValue(uniqueViolation('IDX_tags_name_unique'));

      await expect(service.update(1, { name: 'Новое имя' })).rejects.toThrow(
        'Тег с таким именем уже существует',
      );
    });

    it('нарушение slug-индекса -> сообщение про slug, не про имя', async () => {
      const { repo } = buildRepository();
      const service = new TagsService(repo);
      const tag = buildTag({ id: 1, name: 'Акция', slug: 'akciya' });
      repo.findById.mockResolvedValue(tag);
      repo.findByNameCI.mockResolvedValue(null);
      repo.update.mockRejectedValue(
        uniqueViolation('IDX_b3aa10c29ea4e61a830362bd25'),
      );

      await expect(service.update(1, { name: 'Новое имя' })).rejects.toThrow(
        'Тег с таким slug уже существует',
      );
    });
  });
});
