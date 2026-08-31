import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateLandingDto } from './update-landing.dto';

// §9 ТЗ: DTO-валидация ключевых сущностей. isPublished/priority — NOT NULL с дефолтом в БД,
// @ValidateIf(value !== undefined) вместо @IsOptional() (по образцу update-article.dto.spec.ts).
// coverMediaId — легитимно nullable (снятие обложки).
describe('UpdateLandingDto', () => {
  it('явный null для isPublished отклоняется валидацией', async () => {
    const dto = plainToInstance(UpdateLandingDto, { isPublished: null });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'isPublished')).toBe(true);
  });

  it('явный null для priority отклоняется валидацией', async () => {
    const dto = plainToInstance(UpdateLandingDto, { priority: null });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'priority')).toBe(true);
  });

  it('явный null для coverMediaId проходит — легитимное снятие обложки', async () => {
    const dto = plainToInstance(UpdateLandingDto, { coverMediaId: null });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('пустой патч {} проходит валидацию', async () => {
    const dto = plainToInstance(UpdateLandingDto, {});
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('валидный патч проходит', async () => {
    const dto = plainToInstance(UpdateLandingDto, {
      title: 'Новый заголовок',
      isPublished: true,
      priority: 5,
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });
});
