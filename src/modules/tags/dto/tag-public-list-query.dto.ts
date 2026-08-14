import { IsIn, IsOptional } from 'class-validator';

export class TagPublicListQueryDto {
  // Сузить до тегов, использованных только в статьях/только в кейсах. Без параметра — объединение обоих.
  @IsOptional()
  @IsIn(['article', 'case'])
  type?: 'article' | 'case';
}
