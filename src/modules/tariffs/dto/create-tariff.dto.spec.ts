import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateTariffDto } from './create-tariff.dto';

// Дополняет update-tariff.dto.spec.ts (там — только ValidateIf-сценарии isPopular/orderIndex,
// общие с update-путём). Здесь — обязательность полей на create-пути.
describe('CreateTariffDto', () => {
  const VALID: Partial<CreateTariffDto> = {
    serviceId: 1,
    name: 'Базовый',
    from: '10000',
    features: 'SEO-аудит, 5 статей',
    basePrice: 10000,
  };

  it.each(['serviceId', 'name', 'from', 'features', 'basePrice'] as const)(
    '%s отсутствует — отклоняется',
    async (field) => {
      const payload = { ...VALID };
      delete payload[field];
      const dto = plainToInstance(CreateTariffDto, payload);
      const errors = await validate(dto);
      expect(errors.some((e) => e.property === field)).toBe(true);
    },
  );

  it('basePrice отрицательный — отклоняется (@Min(0))', async () => {
    const dto = plainToInstance(CreateTariffDto, {
      ...VALID,
      basePrice: -1,
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'basePrice')).toBe(true);
  });

  it('periodIds с дублями — отклоняется (@ArrayUnique)', async () => {
    const dto = plainToInstance(CreateTariffDto, {
      ...VALID,
      periodIds: [1, 1, 2],
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'periodIds')).toBe(true);
  });

  it('periodIds отсутствует — проходит (опционален, см. TariffsService.buildBillingCycles)', async () => {
    const dto = plainToInstance(CreateTariffDto, VALID);
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('валидный полный объект проходит', async () => {
    const dto = plainToInstance(CreateTariffDto, {
      ...VALID,
      isPopular: true,
      orderIndex: 1,
      periodIds: [1, 2, 3],
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });
});
