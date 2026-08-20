import { INestApplication } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { StartedTestContainer } from 'testcontainers';
import { Repository } from 'typeorm';
import { Article } from '../src/modules/articles/domain/article.entity';
import { runTestMigrations, startTestDatabase } from './support/test-database';

// §9 ТЗ: «черновик не виден публично, отложенный — до даты». Проверяется на articles — то же
// isXPublished/LessThanOrEqual(now) устройство один в один продублировано для cases/services
// (не отдельная логика на каждый домен), повторный e2e на них не добавляет покрытия.
describe('Публикация: черновик и отложенная статья не видны публично (e2e)', () => {
  let app: INestApplication;
  let postgres: StartedTestContainer;
  let articles: Repository<Article>;

  beforeAll(async () => {
    postgres = await startTestDatabase();
    await runTestMigrations();

    const { AppModule } =
      require('../src/app.module') as typeof import('../src/app.module');

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    articles = moduleRef.get<Repository<Article>>(getRepositoryToken(Article));
  }, 60_000);

  afterAll(async () => {
    await app.close();
    await postgres.stop();
  });

  function listSlugs(response: request.Response): string[] {
    return (
      response.body as { data: { items: { slug: string }[] } }
    ).data.items.map((item) => item.slug);
  }

  function bodySlug(response: request.Response): string {
    return (response.body as { data: { slug: string } }).data.slug;
  }

  function buildArticle(overrides: Partial<Article>): Partial<Article> {
    return {
      title: 'Тестовая статья',
      content: { type: 'doc', content: [] },
      description: null,
      contentHtml: null,
      metaTitle: null,
      metaDescription: null,
      keywords: null,
      readingTime: null,
      hasToc: false,
      priority: 0,
      ...overrides,
    };
  }

  it('черновик (datePublished: null) — 404 по слагу, отсутствует в списке published', async () => {
    const draft = await articles.save(
      articles.create(
        buildArticle({ slug: 'draft-article', datePublished: null }),
      ),
    );

    const bySlug = await request(app.getHttpServer()).get(
      `/articles/info/${draft.slug}`,
    );
    expect(bySlug.status).toBe(404);

    const list = await request(app.getHttpServer()).get(
      '/articles/published/main-info',
    );
    expect(list.status).toBe(200);
    expect(listSlugs(list)).not.toContain(draft.slug);
  });

  it('отложенная публикация (datePublished в будущем) — 404 по слагу, отсутствует в списке до наступления даты', async () => {
    const future = new Date(Date.now() + 24 * 60 * 60 * 1000); // +1 день
    const scheduled = await articles.save(
      articles.create(
        buildArticle({ slug: 'scheduled-article', datePublished: future }),
      ),
    );

    const bySlug = await request(app.getHttpServer()).get(
      `/articles/info/${scheduled.slug}`,
    );
    expect(bySlug.status).toBe(404);

    const list = await request(app.getHttpServer()).get(
      '/articles/published/main-info',
    );
    expect(listSlugs(list)).not.toContain(scheduled.slug);
  });

  it('опубликованная статья (datePublished в прошлом) — 200 по слагу, есть в списке published', async () => {
    const past = new Date(Date.now() - 24 * 60 * 60 * 1000); // -1 день
    const published = await articles.save(
      articles.create(
        buildArticle({ slug: 'published-article', datePublished: past }),
      ),
    );

    const bySlug = await request(app.getHttpServer()).get(
      `/articles/info/${published.slug}`,
    );
    expect(bySlug.status).toBe(200);
    expect(bodySlug(bySlug)).toBe(published.slug);

    const list = await request(app.getHttpServer()).get(
      '/articles/published/main-info',
    );
    expect(listSlugs(list)).toContain(published.slug);
  });
});
