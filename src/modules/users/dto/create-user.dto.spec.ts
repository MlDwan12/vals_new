import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateUserDto } from './create-user.dto';

describe('CreateUserDto', () => {
  it('валидные username/password проходят без ошибок', async () => {
    const dto = plainToInstance(CreateUserDto, {
      username: 'developer1',
      password: 'StrongPass123!',
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('username короче 3 символов отклоняется', async () => {
    const dto = plainToInstance(CreateUserDto, {
      username: 'ab',
      password: 'StrongPass123!',
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'username')).toBe(true);
  });

  it('username длиннее 50 символов отклоняется', async () => {
    const dto = plainToInstance(CreateUserDto, {
      username: 'a'.repeat(51),
      password: 'StrongPass123!',
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'username')).toBe(true);
  });

  it('пустой username отклоняется', async () => {
    const dto = plainToInstance(CreateUserDto, {
      username: '',
      password: 'StrongPass123!',
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'username')).toBe(true);
  });

  it('password короче 6 символов отклоняется', async () => {
    const dto = plainToInstance(CreateUserDto, {
      username: 'developer1',
      password: '12345',
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'password')).toBe(true);
  });

  it('password длиннее 100 символов отклоняется', async () => {
    const dto = plainToInstance(CreateUserDto, {
      username: 'developer1',
      password: 'a'.repeat(101),
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'password')).toBe(true);
  });

  it('пустой password отклоняется', async () => {
    const dto = plainToInstance(CreateUserDto, {
      username: 'developer1',
      password: '',
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'password')).toBe(true);
  });
});
