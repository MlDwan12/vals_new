import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateTagDto } from './update-tag.dto';

// tags.priority — NOT NULL с дефолтом в БД. skipNullProperties: false у PartialType сам по себе
// не спасает: наследуемый от CreateTagDto @IsOptional() всё равно пропускает null мимо валидации
// (IsOptional и добавленный PartialType'ом ValidateIf(value !== undefined) — независимые условия,
// достаточно одного истинного, чтобы пропустить). Поле переведено на @ValidateIf вместо
// @IsOptional() — этот тест это фиксирует (code review).
describe('UpdateTagDto', () => {
  it('явный null для priority отклоняется валидацией, а не падает в БД', async () => {
    const dto = plainToInstance(UpdateTagDto, { priority: null });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'priority')).toBe(true);
  });

  it('пустой патч {} проходит валидацию', async () => {
    const dto = plainToInstance(UpdateTagDto, {});
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('валидный priority проходит', async () => {
    const dto = plainToInstance(UpdateTagDto, { priority: 5 });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });
});
