import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateServiceRelationDto } from './create-service-relation.dto';

describe('CreateServiceRelationDto', () => {
  it('валидный payload проходит', async () => {
    const dto = plainToInstance(CreateServiceRelationDto, {
      serviceId: 1,
      relatedServiceId: 2,
      order: 1,
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('без обязательных полей не проходит', async () => {
    const dto = plainToInstance(CreateServiceRelationDto, {});
    const errors = await validate(dto);
    const invalidProps = errors.map((e) => e.property).sort();
    expect(invalidProps).toEqual(
      ['order', 'relatedServiceId', 'serviceId'].sort(),
    );
  });

  it('serviceId: 0 отклоняется валидацией', async () => {
    const dto = plainToInstance(CreateServiceRelationDto, {
      serviceId: 0,
      relatedServiceId: 2,
      order: 1,
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'serviceId')).toBe(true);
  });
});
