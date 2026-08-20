import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateCaseDto } from './update-case.dto';

// §9 ТЗ: DTO-валидация ключевых сущностей. priority/hasToc — NOT NULL с дефолтом в БД,
// @ValidateIf(value !== undefined) вместо @IsOptional() (M2 code review), тот же паттерн, что у
// статей. datePublished — легитимно nullable (снятие с публикации).
describe('UpdateCaseDto', () => {
  it('явный null для priority отклоняется валидацией', async () => {
    const dto = plainToInstance(UpdateCaseDto, { priority: null });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'priority')).toBe(true);
  });

  it('явный null для hasToc отклоняется валидацией', async () => {
    const dto = plainToInstance(UpdateCaseDto, { hasToc: null });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'hasToc')).toBe(true);
  });

  it('явный null для datePublished проходит — легитимное снятие с публикации', async () => {
    const dto = plainToInstance(UpdateCaseDto, { datePublished: null });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('пустой патч {} проходит валидацию', async () => {
    const dto = plainToInstance(UpdateCaseDto, {});
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('валидный патч проходит', async () => {
    const dto = plainToInstance(UpdateCaseDto, {
      title: 'Новый заголовок',
      priority: 3,
      hasToc: false,
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });
});
