// Форма строки использования — определена здесь, MediaRepository.findCoverUsage() строит массив
// этой формы (тот же приём, что TagWithCountsRow в tags/dto/tag-with-counts-response.dto.ts:
// репозиторий соответствует форме, заданной в dto/, не наоборот).
export interface MediaCoverUsage {
  type: 'article' | 'case' | 'news';
  id: number;
  title: string;
}

// Файл удаляется всегда (FK cover_media_id — SET NULL), usedIn — список материалов, у которых
// обложка только что осиротела, для показа предупреждения в админке (EXPANSION_TASKS.md §4.2).
export class MediaRemoveResponseDto {
  usedIn: MediaCoverUsage[];

  static of(usedIn: MediaCoverUsage[]): MediaRemoveResponseDto {
    const dto = new MediaRemoveResponseDto();
    dto.usedIn = usedIn;
    return dto;
  }
}
