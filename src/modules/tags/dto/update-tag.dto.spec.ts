import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateTagDto } from './update-tag.dto';

// tags.priority — NOT NULL с дефолтом в БД. skipNullProperties: false у PartialType сам по себе
// не спасает: class-validator пропускает проверку поля, если ХОТЯ БЫ ОДНО из его
// conditionalValidations ложно (AND всех условий, не OR) — унаследованный от CreateTagDto
// @IsOptional() возвращает false для null (его смысл — «нет ни null, ни undefined»), и один этим
// пропускает всю проверку, даже когда добавленный PartialType'ом ValidateIf(value !== undefined)
// для null истинен. Поле переведено на @ValidateIf вместо @IsOptional() — этот тест это фиксирует
// (code review).
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
