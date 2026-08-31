import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateLandingDto } from './create-landing.dto';

const validPayload = {
  serviceId: 1,
  industryId: 1,
  slug: 'nishevaya-stranica',
  title: 'Заголовок',
  h1: 'H1',
  content: { type: 'doc' },
};

async function validateDto(overrides: Record<string, unknown>) {
  const dto = plainToInstance(CreateLandingDto, {
    ...validPayload,
    ...overrides,
  });
  return validate(dto);
}

// EXPANSION_TASKS.md задача 10: DTO-валидация нишевых страниц. slug — тот же формат-контракт,
// что у articles/cases/news/tags (Б8, независимый аудит 2026-08-21). isPublished/priority — NOT
// NULL с дефолтом в БД, @ValidateIf(value !== undefined) вместо @IsOptional() уже в самом
// create-landing.dto.ts (тот же приём, что update-article.dto.ts — фиксируем регресс-тестом).
describe('CreateLandingDto', () => {
  it('валидный payload проходит', async () => {
    const errors = await validateDto({});
    expect(errors).toHaveLength(0);
  });

  it('kebab-case slug проходит', async () => {
    const errors = await validateDto({ slug: 'kak-vybrat-crm' });
    expect(errors.some((e) => e.property === 'slug')).toBe(false);
  });

  it('кириллица в slug отклоняется', async () => {
    const errors = await validateDto({ slug: 'как-выбрать-crm' });
    expect(errors.some((e) => e.property === 'slug')).toBe(true);
  });

  it('пробел в slug отклоняется', async () => {
    const errors = await validateDto({ slug: 'kak vybrat' });
    expect(errors.some((e) => e.property === 'slug')).toBe(true);
  });

  it('слэш в slug отклоняется', async () => {
    const errors = await validateDto({ slug: 'kak/vybrat' });
    expect(errors.some((e) => e.property === 'slug')).toBe(true);
  });

  it('верхний регистр в slug отклоняется', async () => {
    const errors = await validateDto({ slug: 'Kak-Vybrat' });
    expect(errors.some((e) => e.property === 'slug')).toBe(true);
  });

  it('без обязательных полей не проходит', async () => {
    const dto = plainToInstance(CreateLandingDto, {});
    const errors = await validate(dto);
    const invalidProps = errors.map((e) => e.property).sort();
    expect(invalidProps).toEqual(
      ['content', 'h1', 'industryId', 'serviceId', 'slug', 'title'].sort(),
    );
  });

  it('явный null для isPublished отклоняется валидацией', async () => {
    const errors = await validateDto({ isPublished: null });
    expect(errors.some((e) => e.property === 'isPublished')).toBe(true);
  });

  it('явный null для priority отклоняется валидацией', async () => {
    const errors = await validateDto({ priority: null });
    expect(errors.some((e) => e.property === 'priority')).toBe(true);
  });

  it('isPublished/priority не переданы — проходит (дефолт в БД)', async () => {
    const errors = await validateDto({});
    expect(errors.some((e) => e.property === 'isPublished')).toBe(false);
    expect(errors.some((e) => e.property === 'priority')).toBe(false);
  });

  it('явный null для coverMediaId проходит — легитимное отсутствие обложки', async () => {
    const errors = await validateDto({ coverMediaId: null });
    expect(errors.some((e) => e.property === 'coverMediaId')).toBe(false);
  });

  it('caseIds с невалидным элементом не проходит', async () => {
    const errors = await validateDto({ caseIds: [1, 0] });
    expect(errors.some((e) => e.property === 'caseIds')).toBe(true);
  });

  it('advantages длиннее 20 элементов не проходит', async () => {
    const errors = await validateDto({ advantages: Array(21).fill('пункт') });
    expect(errors.some((e) => e.property === 'advantages')).toBe(true);
  });
});
