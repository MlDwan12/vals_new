import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateArticleDto } from './create-article.dto';

// Б8 (независимый аудит 2026-08-21): slug — прямой пользовательский ввод, встраивается в
// публичный маршрут — раньше проходил без проверки формата (пробелы/`/`/`?`/кириллица).
describe('CreateArticleDto — формат slug', () => {
  it('kebab-case slug проходит', async () => {
    const dto = plainToInstance(CreateArticleDto, { slug: 'kak-vybrat-crm' });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'slug')).toBe(false);
  });

  it('кириллица в slug отклоняется', async () => {
    const dto = plainToInstance(CreateArticleDto, { slug: 'как-выбрать-crm' });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'slug')).toBe(true);
  });

  it('пробел в slug отклоняется', async () => {
    const dto = plainToInstance(CreateArticleDto, { slug: 'kak vybrat' });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'slug')).toBe(true);
  });

  it('слэш в slug отклоняется', async () => {
    const dto = plainToInstance(CreateArticleDto, { slug: 'kak/vybrat' });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'slug')).toBe(true);
  });

  it('верхний регистр в slug отклоняется', async () => {
    const dto = plainToInstance(CreateArticleDto, { slug: 'Kak-Vybrat' });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'slug')).toBe(true);
  });
});
