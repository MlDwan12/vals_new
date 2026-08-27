import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { LoginDto } from './login.dto';

describe('LoginDto', () => {
  it('валидные username/password проходят без ошибок', async () => {
    const dto = plainToInstance(LoginDto, {
      username: 'developer1',
      password: 'StrongPass123!',
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  // Б2 (независимый аудит 2026-08-21): без верхней границы LoginUsernameThrottleGuard, читающий
  // body.username ещё до этого DTO, использовал бы неограниченную строку как ключ карты.
  it('username длиннее 50 символов отклоняется', async () => {
    const dto = plainToInstance(LoginDto, {
      username: 'a'.repeat(51),
      password: 'StrongPass123!',
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'username')).toBe(true);
  });

  it('password длиннее 100 символов отклоняется', async () => {
    const dto = plainToInstance(LoginDto, {
      username: 'developer1',
      password: 'a'.repeat(101),
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'password')).toBe(true);
  });

  it('пустой username отклоняется', async () => {
    const dto = plainToInstance(LoginDto, {
      username: '',
      password: 'StrongPass123!',
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'username')).toBe(true);
  });

  it('пустой password отклоняется', async () => {
    const dto = plainToInstance(LoginDto, {
      username: 'developer1',
      password: '',
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'password')).toBe(true);
  });
});
