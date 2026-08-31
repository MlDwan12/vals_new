import { INestApplication } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { StartedTestContainer } from 'testcontainers';
import { Repository } from 'typeorm';
import { Case } from '../src/modules/cases/domain/case.entity';
import { Industry } from '../src/modules/industries/domain/industry.entity';
import { Landing } from '../src/modules/landings/domain/landing.entity';
import { Service } from '../src/modules/services/domain/service.entity';
import { ServiceCategory } from '../src/modules/services/domain/service-category.entity';
import {
  createTestIndustry,
  createTestService,
} from './support/landing-fixtures';
import { runTestMigrations, startTestDatabase } from './support/test-database';

// EXPANSION_TASKS.md задача 10: у нишевой страницы (landing) свой, отличный от articles/cases/news
// механизм гейта публикации — булев `isPublished`, не `datePublished <= now`. По этой причине (в
// отличие от cases/services, которые повторяют тот же механизм, что articles, и намеренно не
// получили отдельного e2e — см. publication-visibility.e2e-spec.ts) здесь заведён отдельный тест,
// он проверяет реально новую логику, а не дублирует покрытие.
describe('Публикация: черновик нишевой страницы не виден публично (e2e)', () => {
  let app: INestApplication;
  let postgres: StartedTestContainer;
  let landings: Repository<Landing>;
  let services: Repository<Service>;
  let serviceCategories: Repository<ServiceCategory>;
  let industries: Repository<Industry>;
  let cases: Repository<Case>;
  let service: Service;
  let industry: Industry;

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

    landings = moduleRef.get<Repository<Landing>>(getRepositoryToken(Landing));
    services = moduleRef.get<Repository<Service>>(getRepositoryToken(Service));
    serviceCategories = moduleRef.get<Repository<ServiceCategory>>(
      getRepositoryToken(ServiceCategory),
    );
    industries = moduleRef.get<Repository<Industry>>(
      getRepositoryToken(Industry),
    );
    cases = moduleRef.get<Repository<Case>>(getRepositoryToken(Case));

    service = await createTestService(
      services,
      serviceCategories,
      'crm-vnedrenie',
    );
    industry = await createTestIndustry(industries, 'it');
  }, 60_000);

  afterAll(async () => {
    await app.close();
    await postgres.stop();
  });

  // Nullable-поля без DEFAULT в БД (subtitle/contentHtml/metaTitle/...) намеренно не проставлены —
  // TypeORM вставит NULL и так, явный null в фикстуре был бы только шумом.
  function buildLanding(overrides: Partial<Landing>): Partial<Landing> {
    return {
      service,
      industry,
      title: 'Нишевая страница',
      h1: 'H1',
      content: { type: 'doc', content: [] },
      priority: 0,
      ...overrides,
    };
  }

  it('черновик (isPublished: false) — 404 по составному URL, отсутствует в published/all', async () => {
    const draft = await landings.save(
      landings.create(
        buildLanding({ slug: 'draft-landing', isPublished: false }),
      ),
    );

    const bySlug = await request(app.getHttpServer()).get(
      `/landings/info/${service.slug}/${draft.slug}`,
    );
    expect(bySlug.status).toBe(404);

    const list = await request(app.getHttpServer()).get(
      '/landings/published/all',
    );
    expect(list.status).toBe(200);
    const slugs = (list.body as { data: { slug: string }[] }).data.map(
      (item) => item.slug,
    );
    expect(slugs).not.toContain(draft.slug);
  });

  it('опубликованная страница (isPublished: true) — 200 по составному URL, есть в published/all', async () => {
    const published = await landings.save(
      landings.create(
        buildLanding({ slug: 'published-landing', isPublished: true }),
      ),
    );

    const bySlug = await request(app.getHttpServer()).get(
      `/landings/info/${service.slug}/${published.slug}`,
    );
    expect(bySlug.status).toBe(200);
    expect((bySlug.body as { data: { slug: string } }).data.slug).toBe(
      published.slug,
    );

    const list = await request(app.getHttpServer()).get(
      '/landings/published/all',
    );
    const slugs = (
      list.body as { data: { slug: string; serviceSlug: string }[] }
    ).data;
    expect(slugs).toContainEqual(
      expect.objectContaining({
        slug: published.slug,
        serviceSlug: service.slug,
      }),
    );
  });

  it('чужой serviceSlug для существующего slug страницы — 404 (составной ключ, не просто slug)', async () => {
    const other = await landings.save(
      landings.create(
        buildLanding({ slug: 'scoped-landing', isPublished: true }),
      ),
    );

    const wrongService = await request(app.getHttpServer()).get(
      `/landings/info/nonexistent-service/${other.slug}`,
    );
    expect(wrongService.status).toBe(404);
  });

  // security-review: у Case свой независимый гейт публикации (datePublished), не связанный с
  // landing.isPublished — черновой/отложенный кейс, привязанный к опубликованной странице через
  // caseIds, не должен утекать в публичный ответ раньше своего срока публикации
  // (LandingsRepository.findBySlugPublished фильтрует по образцу
  // CasesRepository.findPublishedCasesByServiceId).
  it('черновой и отложенный кейс, привязанный к опубликованной странице, не попадают в публичный ответ', async () => {
    const publishedCase = await cases.save(
      cases.create({
        slug: 'published-case-for-landing',
        title: 'Опубликованный кейс',
        problem: 'Проблема',
        result: 'Результат',
        datePublished: new Date(Date.now() - 24 * 60 * 60 * 1000),
      }),
    );
    const draftCase = await cases.save(
      cases.create({
        slug: 'draft-case-for-landing',
        title: 'Черновой кейс',
        problem: 'Проблема',
        result: 'Результат',
        datePublished: null,
      }),
    );
    const scheduledCase = await cases.save(
      cases.create({
        slug: 'scheduled-case-for-landing',
        title: 'Отложенный кейс',
        problem: 'Проблема',
        result: 'Результат',
        datePublished: new Date(Date.now() + 24 * 60 * 60 * 1000),
      }),
    );

    const landing = await landings.save(
      landings.create(
        buildLanding({
          slug: 'landing-with-mixed-cases',
          isPublished: true,
          cases: [publishedCase, draftCase, scheduledCase],
        }),
      ),
    );

    const bySlug = await request(app.getHttpServer()).get(
      `/landings/info/${service.slug}/${landing.slug}`,
    );
    expect(bySlug.status).toBe(200);
    const responseCaseSlugs = (
      bySlug.body as { data: { cases: { slug: string }[] } }
    ).data.cases.map((item) => item.slug);
    expect(responseCaseSlugs).toEqual([publishedCase.slug]);
  });
});
