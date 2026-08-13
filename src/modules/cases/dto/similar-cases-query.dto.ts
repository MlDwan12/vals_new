import { Transform } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsInt,
  IsOptional,
  Max,
  Min,
} from 'class-validator';

const DEFAULT_LIMIT = 6;
const MAX_LIMIT = 6;

function toNumberOrUndefined(value: unknown): number | undefined {
  return value === undefined || value === null || value === ''
    ? undefined
    : Number(value);
}

export class SimilarCasesQueryDto {
  @Transform(({ value }: { value: unknown }) =>
    String(value)
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
      .map(Number),
  )
  @IsArray()
  @ArrayNotEmpty()
  @IsInt({ each: true })
  @Min(1, { each: true })
  tagIds: number[];

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => toNumberOrUndefined(value))
  @IsInt()
  @Min(1)
  excludeId?: number;

  @IsOptional()
  @Transform(
    ({ value }: { value: unknown }) =>
      toNumberOrUndefined(value) ?? DEFAULT_LIMIT,
  )
  @IsInt()
  @Min(1)
  @Max(MAX_LIMIT)
  limit: number = DEFAULT_LIMIT;
}
