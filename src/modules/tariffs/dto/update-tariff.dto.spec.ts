import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateTariffDto } from './update-tariff.dto';

// §9 ТЗ: DTO-валидация ключевых сущностей. isPopular/orderIndex — NOT NULL с дефолтом в БД,
// @ValidateIf(value !== undefined) вместо @IsOptional() (M2 code review), тот же паттерн, что у
// статей/кейсов/услуг.
describe('UpdateTariffDto', () => {
  it('явный null для isPopular отклоняется валидацией', async () => {
    const dto = plainToInstance(UpdateTariffDto, { isPopular: null });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'isPopular')).toBe(true);
  });

  it('явный null для orderIndex отклоняется валидацией', async () => {
    const dto = plainToInstance(UpdateTariffDto, { orderIndex: null });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'orderIndex')).toBe(true);
  });

  it('пустой патч {} проходит валидацию', async () => {
    const dto = plainToInstance(UpdateTariffDto, {});
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('валидный патч проходит', async () => {
    const dto = plainToInstance(UpdateTariffDto, {
      isPopular: true,
      orderIndex: 2,
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });
});
