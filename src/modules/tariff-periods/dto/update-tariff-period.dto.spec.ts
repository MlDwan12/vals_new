import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateTariffPeriodDto } from './update-tariff-period.dto';

describe('UpdateTariffPeriodDto', () => {
  it('пустой патч {} проходит валидацию', async () => {
    const dto = plainToInstance(UpdateTariffPeriodDto, {});
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('discountPercent = null — легитимно (nullable-колонка), проходит', async () => {
    const dto = plainToInstance(UpdateTariffPeriodDto, {
      discountPercent: null,
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('months = 0 в патче — отклоняется (@Min(1) сохраняется через PartialType)', async () => {
    const dto = plainToInstance(UpdateTariffPeriodDto, { months: 0 });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'months')).toBe(true);
  });

  it('валидный частичный патч проходит', async () => {
    const dto = plainToInstance(UpdateTariffPeriodDto, { months: 3 });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });
});
