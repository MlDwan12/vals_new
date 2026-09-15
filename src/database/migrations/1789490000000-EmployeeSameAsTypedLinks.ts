import { MigrationInterface, QueryRunner } from 'typeorm';

// employees.same_as: массив строк-ссылок → массив пар {type, url}. Колонка та же (jsonb), меняется
// только форма элементов. Площадка угадывается по домену, всё непонятное — other (поправят в
// панели). Трогаем только строки, где элементы ещё строки, — повторный прогон ничего не ломает.
export class EmployeeSameAsTypedLinks1789490000000 implements MigrationInterface {
  name = 'EmployeeSameAsTypedLinks1789490000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "employees" e
      SET "same_as" = (
        SELECT COALESCE(jsonb_agg(
          jsonb_build_object(
            'type',
            CASE
              WHEN host ~ '(^|\\.)(t\\.me|telegram\\.me)$' THEN 'telegram'
              WHEN host ~ '(^|\\.)(vk\\.com|vk\\.ru)$' THEN 'vk'
              WHEN host ~ '(^|\\.)(dzen\\.ru|zen\\.yandex\\.ru)$' THEN 'dzen'
              WHEN host ~ '(^|\\.)vc\\.ru$' THEN 'vc'
              WHEN host ~ '(^|\\.)habr\\.com$' THEN 'habr'
              WHEN host ~ '(^|\\.)(youtube\\.com|youtu\\.be)$' THEN 'youtube'
              WHEN host ~ '(^|\\.)rutube\\.ru$' THEN 'rutube'
              WHEN host ~ '(^|\\.)linkedin\\.com$' THEN 'linkedin'
              ELSE 'other'
            END,
            'url', link
          ) ORDER BY ord), '[]'::jsonb)
        FROM (
          SELECT link, ord,
                 lower(substring(link from '^[a-zA-Z]+://([^/:?#]+)')) AS host
          FROM jsonb_array_elements_text(e."same_as") WITH ORDINALITY AS t(link, ord)
        ) links
      )
      WHERE jsonb_array_length(e."same_as") > 0
        AND jsonb_typeof(e."same_as" -> 0) = 'string'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "employees" e
      SET "same_as" = (
        SELECT COALESCE(jsonb_agg(item -> 'url' ORDER BY ord), '[]'::jsonb)
        FROM jsonb_array_elements(e."same_as") WITH ORDINALITY AS t(item, ord)
      )
      WHERE jsonb_array_length(e."same_as") > 0
        AND jsonb_typeof(e."same_as" -> 0) = 'object'
    `);
  }
}
