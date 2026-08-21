import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateTariffPeriodDto } from './create-tariff-period.dto';

// §9 ТЗ: DTO-валидация ключевых сущностей. discount_percent — nullable-колонка в БД без дефолта
// (InitialSchema:140, tariff-period.entity.ts) — не тот класс поля, что priority/isPopular в
// остальных модулях (NOT NULL с дефолтом), поэтому здесь корректен обычный @IsOptional() (пропускает
// и undefined, и null), а не @ValidateIf. Тест это фиксирует явно, чтобы не спутать с M2/N3-паттерном.
describe('CreateTariffPeriodDto', () => {
  it('months отсутствует — отклоняется', async () => {
    const dto = plainToInstance(CreateTariffPeriodDto, {});
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'months')).toBe(true);
  });

  it('months = 0 — отклоняется (@Min(1))', async () => {
    const dto = plainToInstance(CreateTariffPeriodDto, { months: 0 });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'months')).toBe(true);
  });

  it('months отрицательный — отклоняется', async () => {
    const dto = plainToInstance(CreateTariffPeriodDto, { months: -1 });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'months')).toBe(true);
  });

  it('discountPercent = 101 — отклоняется (@Max(100))', async () => {
    const dto = plainToInstance(CreateTariffPeriodDto, {
      months: 1,
      discountPercent: 101,
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'discountPercent')).toBe(true);
  });

  it('discountPercent = -1 — отклоняется (@Min(0))', async () => {
    const dto = plainToInstance(CreateTariffPeriodDto, {
      months: 1,
      discountPercent: -1,
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'discountPercent')).toBe(true);
  });

  it('discountPercent = null — легитимно (колонка nullable без дефолта), проходит', async () => {
    const dto = plainToInstance(CreateTariffPeriodDto, {
      months: 1,
      discountPercent: null,
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('discountPercent отсутствует — проходит', async () => {
    const dto = plainToInstance(CreateTariffPeriodDto, { months: 6 });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('валидный объект проходит', async () => {
    const dto = plainToInstance(CreateTariffPeriodDto, {
      months: 12,
      discountPercent: 15,
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });
});
