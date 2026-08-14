import { ObjectLiteral, SelectQueryBuilder } from 'typeorm';

// Лёгкая проекция автора/тега для джойна к статье/кейсу — одинаковая для обоих доменов.
export const AUTHOR_SHORT_FIELDS = [
  'author.id',
  'author.slug',
  'author.name',
  'author.photoUrl',
  'author.position',
  'author.experience',
];

export const TAG_SHORT_FIELDS = [
  'tag.id',
  'tag.slug',
  'tag.name',
  'tag.priority',
];

interface RelationJoinConfig {
  entityAlias: string;
  joinTable: string;
  entityIdColumn: string;
}

// Подзапрос, а не andWhere на join-алиасе: join нужен только чтобы подгрузить ПОЛНЫЙ список
// авторов записи, не для фильтрации — иначе у записи с несколькими авторами из результата
// пропали бы все совпавшие строки, кроме той, что относится к автору-фильтру.
export function applyAuthorSlugFilter<T extends ObjectLiteral>(
  qb: SelectQueryBuilder<T>,
  config: RelationJoinConfig,
  authorSlug?: string,
): void {
  if (!authorSlug) return;

  qb.andWhere((sub) => {
    const subQuery = sub
      .subQuery()
      .select(`ja.${config.entityIdColumn}`)
      .from(config.joinTable, 'ja')
      .innerJoin('employees', 'e', 'e.id = ja.employee_id')
      .where('e.slug = :authorSlug')
      .getQuery();
    return `${config.entityAlias}.id IN ${subQuery}`;
  }).setParameter('authorSlug', authorSlug);
}

// Тот же приём, что и у авторов (см. applyAuthorSlugFilter).
export function applyTagSlugFilter<T extends ObjectLiteral>(
  qb: SelectQueryBuilder<T>,
  config: RelationJoinConfig,
  tagSlug?: string,
): void {
  if (!tagSlug) return;

  qb.andWhere((sub) => {
    const subQuery = sub
      .subQuery()
      .select(`jt.${config.entityIdColumn}`)
      .from(config.joinTable, 'jt')
      .innerJoin('tags', 't', 't.id = jt.tag_id')
      .where('t.slug = :tagSlug')
      .getQuery();
    return `${config.entityAlias}.id IN ${subQuery}`;
  }).setParameter('tagSlug', tagSlug);
}
