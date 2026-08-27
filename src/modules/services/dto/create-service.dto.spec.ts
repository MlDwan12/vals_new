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
