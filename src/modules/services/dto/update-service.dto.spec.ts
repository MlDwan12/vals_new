import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateServiceDto } from './update-service.dto';

// §9 ТЗ: DTO-валидация ключевых сущностей. backgroundColor — NOT NULL с дефолтом в БД,
// @ValidateIf(value !== undefined) вместо @IsOptional() (M2 code review), тот же паттерн, что у
// статей/кейсов.
describe('UpdateServiceDto', () => {
  it('явный null для backgroundColor отклоняется валидацией', async () => {
    const dto = plainToInstance(UpdateServiceDto, { backgroundColor: null });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'backgroundColor')).toBe(true);
  });

  it('пустой патч {} проходит валидацию', async () => {
    const dto = plainToInstance(UpdateServiceDto, {});
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('валидный патч проходит', async () => {
    const dto = plainToInstance(UpdateServiceDto, {
      title: 'Новая услуга',
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });
});
