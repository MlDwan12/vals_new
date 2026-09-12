import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateServiceDto } from './create-service.dto';

// Б8 (независимый аудит 2026-08-21): slug — прямой пользовательский ввод, встраивается в
// публичный маршрут — раньше проходил без проверки формата (пробелы/`/`/`?`/кириллица) и вообще
// без @MaxLength (единственный из трёх content-доменов без него).
describe('CreateServiceDto — формат slug', () => {
  it('kebab-case slug проходит', async () => {
    const dto = plainToInstance(CreateServiceDto, { slug: 'razrabotka-crm' });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'slug')).toBe(false);
  });

  it('кириллица в slug отклоняется', async () => {
    const dto = plainToInstance(CreateServiceDto, { slug: 'разработка-crm' });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'slug')).toBe(true);
  });

  it('пробел в slug отклоняется', async () => {
    const dto = plainToInstance(CreateServiceDto, { slug: 'razrabotka crm' });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'slug')).toBe(true);
  });

  it('slug длиннее 255 символов отклоняется', async () => {
    const dto = plainToInstance(CreateServiceDto, { slug: 'a'.repeat(256) });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'slug')).toBe(true);
  });
});

// EXPANSION_TASKS.md задача 9: мета-поля услуг, тот же контракт валидации, что у CreateArticleDto.
describe('CreateServiceDto — мета-поля', () => {
  const validPayload = {
    slug: 'razrabotka-crm',
    categoryId: 1,
    title: 'Разработка CRM',
    description: 'Описание',
    subDescription: 'Подописание',
    icon: 'crm',
  };

  async function validateDto(overrides: Record<string, unknown>) {
    const dto = plainToInstance(CreateServiceDto, {
      ...validPayload,
      ...overrides,
    });
    return validate(dto);
  }

  it('без мета-полей проходит валидацию', async () => {
    const errors = await validateDto({});
    expect(errors).toHaveLength(0);
  });

  it('metaTitle длиннее 255 символов отклоняется', async () => {
    const errors = await validateDto({ metaTitle: 'a'.repeat(256) });
    expect(errors.some((e) => e.property === 'metaTitle')).toBe(true);
  });

  it('h1 длиннее 255 символов отклоняется', async () => {
    const errors = await validateDto({ h1: 'a'.repeat(256) });
    expect(errors.some((e) => e.property === 'h1')).toBe(true);
  });

  // Лимит у услуг выше, чем у прочих сущностей (10 против 5) — живая мета 18 услуг держит 6–8
  // фраз, см. комментарий в create-service.dto.ts.
  it('восемь ключевых фраз в keywords проходят', async () => {
    const errors = await validateDto({
      keywords: 'раз, два, три, четыре, пять, шесть, семь, восемь',
    });
    expect(errors).toHaveLength(0);
  });

  it('больше 10 ключевых фраз в keywords отклоняется', async () => {
    const errors = await validateDto({
      keywords:
        'раз, два, три, четыре, пять, шесть, семь, восемь, девять, десять, одиннадцать',
    });
    expect(errors.some((e) => e.property === 'keywords')).toBe(true);
  });

  // Заголовок услуги хранится с разметкой — см. комментарий к h1 в create-service.dto.ts.
  it('h1 с <br> и <span> проходит', async () => {
    const errors = await validateDto({
      h1: 'Геомаркетинг: <br> клиенты из <br><span>карт и навигаторов</span>',
    });
    expect(errors).toHaveLength(0);
  });

  it('h1 с посторонним тегом отклоняется', async () => {
    const errors = await validateDto({
      h1: 'Заголовок <script>alert(1)</script>',
    });
    expect(errors.some((e) => e.property === 'h1')).toBe(true);
  });

  it('валидные мета-поля проходят', async () => {
    const errors = await validateDto({
      metaTitle: 'Заголовок',
      metaDescription: 'Описание для поисковика',
      keywords: 'crm, внедрение',
      h1: 'Внедрение CRM',
    });
    expect(errors).toHaveLength(0);
  });
});
