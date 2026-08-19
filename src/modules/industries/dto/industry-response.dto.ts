import { Industry } from '../domain/industry.entity';

export class IndustryResponseDto {
  id: number;
  slug: string | null;
  name: string;

  static fromEntity(industry: Industry): IndustryResponseDto {
    const dto = new IndustryResponseDto();
    dto.id = industry.id;
    dto.slug = industry.slug;
    dto.name = industry.name;
    return dto;
  }
}
