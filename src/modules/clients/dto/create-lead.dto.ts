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
import { TruncateString } from '../../../core/util/truncate.util';
import { ClientLeadType } from '../enums/client-lead-type.enum';

// EXPANSION_TASKS.md §7: "длины ограничить, значения обрезать, а не отклонять заявку из-за
// длинного URL" — обрезка вместо @MaxLength (который бы отклонил заявку целиком).
const PAGE_PATH_MAX_LENGTH = 500;
const BLOCK_ID_MAX_LENGTH = 255;
const REFERRER_MAX_LENGTH = 2048;
const LANDING_PATH_MAX_LENGTH = 500;

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

  // Внутренняя метка формы (EXPANSION_TASKS.md §6) — короткий константный код с фронта, не
  // произвольный URL, поэтому длинное значение — признак мусора/атаки, а не легитимного контента:
  // отклоняем, а не обрезаем (в отличие от pagePath/referrer ниже). Незнакомый, но короткий formId
  // не отклоняется здесь — мягкая деградация до null происходит в LeadsService.
  @IsOptional()
  @IsString()
  @MaxLength(64)
  formId?: string;

  @IsOptional()
  @IsString()
  @TruncateString(PAGE_PATH_MAX_LENGTH)
  pagePath?: string;

  @IsOptional()
  @IsString()
  @TruncateString(BLOCK_ID_MAX_LENGTH)
  blockId?: string;

  // Источник перехода (EXPANSION_TASKS.md §7) — первый реферер и страница входа за сессию,
  // фиксируются на фронте (document.referrer теряется при внутренней навигации). userAgent сюда не
  // входит — он берётся сервером из заголовка запроса (см. LeadsController), не с фронта.
  @IsOptional()
  @IsString()
  @TruncateString(REFERRER_MAX_LENGTH)
  referrer?: string;

  @IsOptional()
  @IsString()
  @TruncateString(LANDING_PATH_MAX_LENGTH)
  landingPath?: string;
}
