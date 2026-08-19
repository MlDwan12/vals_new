import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ClientLeadType } from '../enums/client-lead-type.enum';
import { CreateLeadDto } from './create-lead.dto';

async function validateDto(plain: Record<string, unknown>) {
  const dto = plainToInstance(CreateLeadDto, plain);
  return validate(dto);
}

describe('CreateLeadDto', () => {
  it('валидный FREE_CONSULTATION с message проходит', async () => {
    const errors = await validateDto({
      name: 'Иван',
      phone: '79991112233',
      type: ClientLeadType.FREE_CONSULTATION,
      message: 'Хочу консультацию',
    });
    expect(errors).toHaveLength(0);
  });

  it('валидный FREE_AUDIT с message проходит', async () => {
    const errors = await validateDto({
      name: 'Иван',
      phone: '79991112233',
      type: ClientLeadType.FREE_AUDIT,
      message: 'Проверьте сайт',
    });
    expect(errors).toHaveLength(0);
  });

  it('валидный PARTNER без дополнительных полей проходит', async () => {
    const errors = await validateDto({
      name: 'Иван',
      phone: '79991112233',
      type: ClientLeadType.PARTNER,
    });
    expect(errors).toHaveLength(0);
  });

  it('валидный ADD_QUESTION без дополнительных полей проходит', async () => {
    const errors = await validateDto({
      name: 'Иван',
      phone: '79991112233',
      type: ClientLeadType.ADD_QUESTION,
    });
    expect(errors).toHaveLength(0);
  });

  it('валидный TARIFF_REQUEST с tariffId/periodId/email/comment проходит', async () => {
    const errors = await validateDto({
      name: 'Иван',
      phone: '79991112233',
      type: ClientLeadType.TARIFF_REQUEST,
      email: 'client@example.com',
      comment: 'хочу тариф',
      tariffId: 1,
      periodId: 2,
    });
    expect(errors).toHaveLength(0);
  });

  it('TARIFF_REQUEST без tariffId не проходит', async () => {
    const errors = await validateDto({
      name: 'Иван',
      phone: '79991112233',
      type: ClientLeadType.TARIFF_REQUEST,
      periodId: 2,
    });
    expect(errors.some((e) => e.property === 'tariffId')).toBe(true);
  });

  it('TARIFF_REQUEST без periodId не проходит', async () => {
    const errors = await validateDto({
      name: 'Иван',
      phone: '79991112233',
      type: ClientLeadType.TARIFF_REQUEST,
      tariffId: 1,
    });
    expect(errors.some((e) => e.property === 'periodId')).toBe(true);
  });

  it('без обязательных name/phone/type не проходит', async () => {
    const errors = await validateDto({});
    const invalidProps = errors.map((e) => e.property).sort();
    expect(invalidProps).toEqual(['name', 'phone', 'type']);
  });

  it('невалидный type не проходит', async () => {
    const errors = await validateDto({
      name: 'Иван',
      phone: '79991112233',
      type: 'BOGUS',
    });
    expect(errors.some((e) => e.property === 'type')).toBe(true);
  });

  it('message длиннее 5000 символов не проходит', async () => {
    const errors = await validateDto({
      name: 'Иван',
      phone: '79991112233',
      type: ClientLeadType.FREE_CONSULTATION,
      message: 'a'.repeat(5001),
    });
    expect(errors.some((e) => e.property === 'message')).toBe(true);
  });

  it('невалидный email у не-TARIFF_REQUEST не блокирует лид (M5 code review)', async () => {
    const errors = await validateDto({
      name: 'Иван',
      phone: '79991112233',
      type: ClientLeadType.FREE_CONSULTATION,
      email: 'ivan@',
    });
    expect(errors).toHaveLength(0);
  });

  it('невалидный email у TARIFF_REQUEST не проходит', async () => {
    const errors = await validateDto({
      name: 'Иван',
      phone: '79991112233',
      type: ClientLeadType.TARIFF_REQUEST,
      email: 'ivan@',
      tariffId: 1,
      periodId: 2,
    });
    expect(errors.some((e) => e.property === 'email')).toBe(true);
  });

  it('honeypot-поле website — валидная опциональная строка, не ломает валидацию', async () => {
    const errors = await validateDto({
      name: 'Bot',
      phone: '79991112233',
      type: ClientLeadType.PARTNER,
      website: 'http://spam.example',
    });
    expect(errors).toHaveLength(0);
  });
});
