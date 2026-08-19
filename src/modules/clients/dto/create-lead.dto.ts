import { Type } from 'class-transformer';
import {
  IsEmail,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { ClientLeadType } from '../enums/client-lead-type.enum';

export class CreateLeadDto {
  @IsString()
  @MaxLength(255)
  name: string;

  @IsString()
  @MaxLength(32)
  phone: string;

  @IsEnum(ClientLeadType)
  type: ClientLeadType;

  // Формат/длина валидируются всегда, вне зависимости от type — @ValidateIf гасит валидаторы
  // целиком для остальных типов (не отклоняет само поле, whitelist его всё равно пропускает), так
  // что «необязательное только для этого типа» и «не нужно валидировать для остальных типов» — два
  // разных требования; здесь нужно только первое.
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  message?: string;

  // Контракт старого API (M5 code review) — строгий формат email проверяется только для
  // TARIFF_REQUEST; для остальных типов заявок опечатка вроде "ivan@" не должна ронять весь лид
  // 400-й — посетитель всё равно становится лидом по телефону.
  @ValidateIf((o: CreateLeadDto) => o.type === ClientLeadType.TARIFF_REQUEST)
  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  comment?: string;

  @ValidateIf((o: CreateLeadDto) => o.type === ClientLeadType.TARIFF_REQUEST)
  @Type(() => Number)
  @IsNumber()
  tariffId?: number;

  @ValidateIf((o: CreateLeadDto) => o.type === ClientLeadType.TARIFF_REQUEST)
  @Type(() => Number)
  @IsNumber()
  periodId?: number;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  utm?: string;

  // Honeypot (ТЗ §6 — защита формы от спама): скрытое на фронте поле, реальные пользователи его не
  // видят и не заполняют. Заполнено → тихо принимаем 200/201, но не обрабатываем заявку — бот не
  // должен понять, что его отсекли.
  @IsOptional()
  @IsString()
  @MaxLength(255)
  website?: string;
}
