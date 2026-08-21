import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateIndustryDto } from './update-industry.dto';

// §9 ТЗ: DTO-валидация ключевых сущностей. slug — @ValidateIf(value !== undefined), не
// @IsOptional(): страница отрасли может не иметь slug (ещё не опубликована), но явный `null` в
// PATCH обязан отклоняться, иначе PATCH освободил бы slug уже опубликованной отрасли (см.
// комментарий в create-industry.dto.ts).
describe('UpdateIndustryDto', () => {
  it('явный null для slug отклоняется валидацией', async () => {
    const dto = plainToInstance(UpdateIndustryDto, { slug: null });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'slug')).toBe(true);
  });

  it('пустой патч {} проходит валидацию', async () => {
    const dto = plainToInstance(UpdateIndustryDto, {});
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('slug отсутствует (undefined) проходит — опциональность сохранена', async () => {
    const dto = plainToInstance(UpdateIndustryDto, { name: 'IT' });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('валидный патч со slug проходит', async () => {
    const dto = plainToInstance(UpdateIndustryDto, {
      slug: 'it',
      name: 'IT',
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });
});
