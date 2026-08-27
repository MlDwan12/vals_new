import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateCaseDto } from './create-case.dto';

// Б8 (независимый аудит 2026-08-21): slug — прямой пользовательский ввод, встраивается в
// публичный маршрут — раньше проходил без проверки формата (пробелы/`/`/`?`/кириллица).
describe('CreateCaseDto — формат slug', () => {
  it('kebab-case slug проходит', async () => {
    const dto = plainToInstance(CreateCaseDto, { slug: 'vnedrenie-crm' });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'slug')).toBe(false);
  });

  it('кириллица в slug отклоняется', async () => {
    const dto = plainToInstance(CreateCaseDto, { slug: 'внедрение-crm' });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'slug')).toBe(true);
  });

  it('пробел в slug отклоняется', async () => {
    const dto = plainToInstance(CreateCaseDto, { slug: 'vnedrenie crm' });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'slug')).toBe(true);
  });

  it('слэш в slug отклоняется', async () => {
    const dto = plainToInstance(CreateCaseDto, { slug: 'vnedrenie/crm' });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'slug')).toBe(true);
  });
});
