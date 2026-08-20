import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateArticleDto } from './update-article.dto';

// §9 ТЗ: DTO-валидация ключевых сущностей. priority/hasToc — NOT NULL с дефолтом в БД,
// @ValidateIf(value !== undefined) вместо @IsOptional() (M2 code review) — фиксируем регресс-тестом
// по образцу tags/update-tag.dto.spec.ts. datePublished — легитимно nullable (снятие с публикации).
describe('UpdateArticleDto', () => {
  it('явный null для priority отклоняется валидацией', async () => {
    const dto = plainToInstance(UpdateArticleDto, { priority: null });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'priority')).toBe(true);
  });

  it('явный null для hasToc отклоняется валидацией', async () => {
    const dto = plainToInstance(UpdateArticleDto, { hasToc: null });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'hasToc')).toBe(true);
  });

  it('явный null для datePublished проходит — легитимное снятие с публикации', async () => {
    const dto = plainToInstance(UpdateArticleDto, { datePublished: null });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('пустой патч {} проходит валидацию', async () => {
    const dto = plainToInstance(UpdateArticleDto, {});
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('валидный патч проходит', async () => {
    const dto = plainToInstance(UpdateArticleDto, {
      title: 'Новый заголовок',
      priority: 5,
      hasToc: true,
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });
});
