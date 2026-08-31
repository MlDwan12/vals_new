import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { LandingListQueryDto } from './landing-list-query.dto';

// code review: LandingsRepository.mainInfoQuery() фильтрует через `if (query.serviceId)` —
// без нижней границы serviceId=0/industryId=0 проходили бы валидацию, а truthy-проверка молча
// съедала бы фильтр вместо пустого результата. @Min(1) отсекает это на границе DTO.
describe('LandingListQueryDto', () => {
  it('serviceId: 0 отклоняется валидацией', async () => {
    const dto = plainToInstance(LandingListQueryDto, { serviceId: 0 });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'serviceId')).toBe(true);
  });

  it('industryId: 0 отклоняется валидацией', async () => {
    const dto = plainToInstance(LandingListQueryDto, { industryId: 0 });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'industryId')).toBe(true);
  });

  it('positive serviceId/industryId проходят валидацию', async () => {
    const dto = plainToInstance(LandingListQueryDto, {
      serviceId: 1,
      industryId: 2,
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });
});
