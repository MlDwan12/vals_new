import { LessThanOrEqual, MoreThan, ObjectLiteral, Repository } from 'typeorm';

export interface PublicationStats {
  total: number;
  published: number;
  scheduled: number;
}

// Общий подсчёт для дашборда (articles/cases — сущности с датой отложенной публикации):
// "опубликовано" = datePublished задан и не в будущем, "запланировано" = в будущем. NULL из обоих
// count'ов исключается самой семантикой sql-сравнения (NULL <= now → false), явный IS NULL не нужен.
export async function countPublicationStats<T extends ObjectLiteral>(
  repo: Repository<T>,
  dateField: Extract<keyof T, string>,
): Promise<PublicationStats> {
  const now = new Date();
  const [total, published, scheduled] = await Promise.all([
    repo.count(),
    repo.count({ where: { [dateField]: LessThanOrEqual(now) } as never }),
    repo.count({ where: { [dateField]: MoreThan(now) } as never }),
  ]);
  return { total, published, scheduled };
}
