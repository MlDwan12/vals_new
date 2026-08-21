import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateEmployeeDto } from './update-employee.dto';

// §9 ТЗ: DTO-валидация ключевых сущностей. sameAs/priority/isVisible — NOT NULL с дефолтом в БД,
// @ValidateIf(value !== undefined) вместо @IsOptional() (M2 code review), тот же паттерн, что у
// статей/кейсов/услуг/тарифов.
describe('UpdateEmployeeDto', () => {
  it('явный null для sameAs отклоняется валидацией', async () => {
    const dto = plainToInstance(UpdateEmployeeDto, { sameAs: null });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'sameAs')).toBe(true);
  });

  it('явный null для priority отклоняется валидацией', async () => {
    const dto = plainToInstance(UpdateEmployeeDto, { priority: null });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'priority')).toBe(true);
  });

  it('явный null для isVisible отклоняется валидацией', async () => {
    const dto = plainToInstance(UpdateEmployeeDto, { isVisible: null });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'isVisible')).toBe(true);
  });

  it('пустой патч {} проходит валидацию', async () => {
    const dto = plainToInstance(UpdateEmployeeDto, {});
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('валидный патч проходит', async () => {
    const dto = plainToInstance(UpdateEmployeeDto, {
      sameAs: ['https://t.me/example'],
      priority: 3,
      isVisible: true,
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });
});
