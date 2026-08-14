import { Industry } from '../domain/industry.entity';

export class IndustryResponseDto {
  id: number;
  name: string;

  static fromEntity(industry: Industry): IndustryResponseDto {
    const dto = new IndustryResponseDto();
    dto.id = industry.id;
    dto.name = industry.name;
    return dto;
  }
}
