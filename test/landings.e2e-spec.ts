import { INestApplication } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { StartedTestContainer } from 'testcontainers';
import { Repository } from 'typeorm';
import { Role } from '../src/core/enums/role.enum';
import { Case } from '../src/modules/cases/domain/case.entity';
import { Industry } from '../src/modules/industries/domain/industry.entity';
import { Landing } from '../src/modules/landings/domain/landing.entity';
import { Media } from '../src/modules/media/domain/media.entity';
import { Service } from '../src/modules/services/domain/service.entity';
import { ServiceCategory } from '../src/modules/services/domain/service-category.entity';
import { User } from '../src/modules/users/domain/user.entity';
import {
  createTestIndustry,
  createTestService,
} from './support/landing-fixtures';
import { resolveRoleId } from './support/resolve-role-id';
import { runTestMigrations, startTestDatabase } from './support/test-database';

const ORIGIN = 'http://localhost:3001';

// EXPANSION_TASKS.md задача 10 (нишевые страницы): CRUD + FAQ через admin-роуты, RESTRICT-гейт
// при удалении услуги/отрасли с привязанной страницей (§10.1 expansion-decisions.md), и
// расширение "обложка использована" (EXPANSION_TASKS.md §4.2) на landing как четвёртый тип.
describe('Landings admin: CRUD + FAQ + delete guards (e2e)', () => {
  let app: INestApplication;
  let postgres: StartedTestContainer;
  let moduleRef: TestingModule;
  let users: Repository<User>;
  let landings: Repository<Landing>;
  let services: Repository<Service>;
  let serviceCategories: Repository<ServiceCategory>;
  let industries: Repository<Industry>;
  let media: Repository<Media>;
  let cases: Repository<Case>;
  let contentManagerCookie: string;

  beforeAll(async () => {
    postgres = await startTestDatabase();
    await runTestMigrations();

    const { AppModule } =
      require('../src/app.module') as typeof import('../src/app.module');

    moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    await app.init();

    users = moduleRef.get<Repository<User>>(getRepositoryToken(User));
    landings = moduleRef.get<Repository<Landing>>(getRepositoryToken(Landing));
    services = moduleRef.get<Repository<Service>>(getRepositoryToken(Service));
    serviceCategories = moduleRef.get<Repository<ServiceCategory>>(
      getRepositoryToken(ServiceCategory),
    );
    industries = moduleRef.get<Repository<Industry>>(
      getRepositoryToken(Industry),
    );
    media = moduleRef.get<Repository<Media>>(getRepositoryToken(Media));
    cases = moduleRef.get<Repository<Case>>(getRepositoryToken(Case));

    const passwordHash = await bcrypt.hash('LandingsE2ePass123!', 4);
    const roleId = await resolveRoleId(moduleRef, Role.CONTENT_MANAGER);
    await users.save(
      users.create({
        username: 'landings-e2e-content-manager',
        password: passwordHash,
        roleId,
        isActive: true,
      }),
    );
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .set('Origin', ORIGIN)
      .send({
        username: 'landings-e2e-content-manager',
        password: 'LandingsE2ePass123!',
      });
    expect(login.status).toBe(201);
    const raw = login.headers['set-cookie'] as unknown as string[] | undefined;
    contentManagerCookie = (raw ?? [])
      .map((cookie) => cookie.split(';')[0])
      .join('; ');
  }, 60_000);

  afterAll(async () => {
    await app.close();
    await postgres.stop();
  });

  function createService(slug: string): Promise<Service> {
    return createTestService(services, serviceCategories, slug);
  }

  function createIndustry(slug: string): Promise<Industry> {
    return createTestIndustry(industries, slug);
  }

  function agent(method: 'get' | 'post' | 'patch' | 'delete', path: string) {
    return request(app.getHttpServer())
      [method](path)
      .set('Origin', ORIGIN)
      .set('Cookie', contentManagerCookie);
  }

  describe('CRUD + FAQ + связанные кейсы', () => {
    it('создаёт, читает, правит и удаляет нишевую страницу вместе с FAQ', async () => {
      const service = await createService('crud-service');
      const industry = await createIndustry('crud-industry');
      const relatedCase = await cases.save(
        cases.create({
          slug: 'crud-case',
          title: 'Кейс',
          problem: 'Проблема',
          result: 'Результат',
        }),
      );

      const create = await agent('post', '/admin/landings').send({
        serviceId: service.id,
        industryId: industry.id,
        slug: 'crud-landing',
        title: 'Заголовок',
        h1: 'H1',
        content: { type: 'doc' },
        caseIds: [relatedCase.id],
      });
      expect(create.status).toBe(201);
      const created = (
        create.body as {
          data: { id: number; slug: string; cases: { id: number }[] };
        }
      ).data;
      expect(created.slug).toBe('crud-landing');
      expect(created.cases.map((c) => c.id)).toEqual([relatedCase.id]);

      const faqCreate = await agent('post', '/admin/landing-faq').send({
        landingId: created.id,
        question: 'Вопрос?',
        answer: 'Ответ.',
      });
      expect(faqCreate.status).toBe(201);
      const faq = (faqCreate.body as { data: { id: number } }).data;

      const readAfterFaq = await agent('get', `/admin/landings/${created.id}`);
      expect(readAfterFaq.status).toBe(200);
      const readBody = (
        readAfterFaq.body as { data: { faq: { id: number }[] } }
      ).data;
      expect(readBody.faq.map((item) => item.id)).toContain(faq.id);

      const update = await agent('patch', `/admin/landings/${created.id}`).send(
        {
          title: 'Новый заголовок',
          isPublished: true,
        },
      );
      expect(update.status).toBe(200);
      const updated = (
        update.body as { data: { title: string; isPublished: boolean } }
      ).data;
      expect(updated.title).toBe('Новый заголовок');
      expect(updated.isPublished).toBe(true);

      const remove = await agent('delete', `/admin/landings/${created.id}`);
      expect(remove.status).toBe(204);

      const readAfterRemove = await agent(
        'get',
        `/admin/landings/${created.id}`,
      );
      expect(readAfterRemove.status).toBe(404);

      const faqAfterRemove = await agent('get', `/admin/landing-faq/${faq.id}`);
      expect(faqAfterRemove.status).toBe(404);
    });

    it('список фильтруется по serviceId/industryId/search', async () => {
      const serviceA = await createService('filter-service-a');
      const serviceB = await createService('filter-service-b');
      const industryA = await createIndustry('filter-industry-a');
      const industryB = await createIndustry('filter-industry-b');

      const landingA = await landings.save(
        landings.create({
          service: serviceA,
          industry: industryA,
          slug: 'filter-landing-a',
          title: 'Уникальный заголовок альфа',
          h1: 'H1',
          content: {},
          isPublished: false,
          priority: 0,
        }),
      );
      const landingB = await landings.save(
        landings.create({
          service: serviceB,
          industry: industryB,
          slug: 'filter-landing-b',
          title: 'Другой заголовок бета',
          h1: 'H1',
          content: {},
          isPublished: false,
          priority: 0,
        }),
      );

      const byService = await agent(
        'get',
        `/admin/landings?serviceId=${serviceA.id}`,
      );
      expect(byService.status).toBe(200);
      const byServiceIds = (
        byService.body as { data: { items: { id: number }[] } }
      ).data.items.map((item) => item.id);
      expect(byServiceIds).toContain(landingA.id);
      expect(byServiceIds).not.toContain(landingB.id);

      const byIndustry = await agent(
        'get',
        `/admin/landings?industryId=${industryB.id}`,
      );
      const byIndustryIds = (
        byIndustry.body as { data: { items: { id: number }[] } }
      ).data.items.map((item) => item.id);
      expect(byIndustryIds).not.toContain(landingA.id);

      const bySearch = await agent('get', '/admin/landings?search=альфа');
      const bySearchTitles = (
        bySearch.body as { data: { items: { title: string }[] } }
      ).data.items.map((item) => item.title);
      expect(bySearchTitles).toContain('Уникальный заголовок альфа');
    });
  });

  describe('RESTRICT: удаление услуги/отрасли, используемой в нишевой странице', () => {
    it('DELETE /admin/services/:id — 409 со списком страниц, пока привязана нишевая страница', async () => {
      const service = await createService('restrict-service');
      const industry = await createIndustry('restrict-industry-service');
      const landing = await landings.save(
        landings.create({
          service,
          industry,
          slug: 'restrict-landing-service',
          title: 'Заблокированная страница',
          h1: 'H1',
          content: {},
          isPublished: false,
          priority: 0,
        }),
      );

      const deleteAttempt = await agent(
        'delete',
        `/admin/services/${service.id}`,
      );
      expect(deleteAttempt.status).toBe(409);
      expect((deleteAttempt.body as { message: string }).message).toContain(
        'Заблокированная страница',
      );

      await landings.delete(landing.id);
      const deleteAfterCleanup = await agent(
        'delete',
        `/admin/services/${service.id}`,
      );
      expect(deleteAfterCleanup.status).toBe(204);
    });

    it('DELETE /admin/industry/:id — 409 со списком страниц, пока привязана нишевая страница', async () => {
      const service = await createService('restrict-service-2');
      const industry = await createIndustry('restrict-industry');
      const landing = await landings.save(
        landings.create({
          service,
          industry,
          slug: 'restrict-landing-industry',
          title: 'Другая заблокированная страница',
          h1: 'H1',
          content: {},
          isPublished: false,
          priority: 0,
        }),
      );

      const deleteAttempt = await agent(
        'delete',
        `/admin/industry/${industry.id}`,
      );
      expect(deleteAttempt.status).toBe(409);
      expect((deleteAttempt.body as { message: string }).message).toContain(
        'Другая заблокированная страница',
      );

      await landings.delete(landing.id);
      const deleteAfterCleanup = await agent(
        'delete',
        `/admin/industry/${industry.id}`,
      );
      expect(deleteAfterCleanup.status).toBe(204);
    });
  });

  describe('Обложка медиа, использованная нишевой страницей', () => {
    it('DELETE /admin/media/:id — usedIn содержит {type: "landing", ...}, файл удаляется', async () => {
      const service = await createService('cover-service');
      const industry = await createIndustry('cover-industry');
      const cover = await media.save(
        media.create({
          name: 'Обложка',
          fileName: `cover-${Date.now()}.webp`,
          alt: null,
          width: null,
          height: null,
          mimeType: 'image/webp',
          sizeBytes: 1,
        }),
      );
      const landing = await landings.save(
        landings.create({
          service,
          industry,
          slug: 'cover-landing',
          title: 'Страница с обложкой',
          h1: 'H1',
          content: {},
          cover,
          isPublished: false,
          priority: 0,
        }),
      );

      const removeMedia = await agent('delete', `/admin/media/${cover.id}`);
      expect(removeMedia.status).toBe(200);
      const usedIn = (
        removeMedia.body as {
          data: { usedIn: { type: string; id: number; title: string }[] };
        }
      ).data.usedIn;
      expect(usedIn).toContainEqual({
        type: 'landing',
        id: landing.id,
        title: 'Страница с обложкой',
      });

      const afterRemove = await agent('get', `/admin/landings/${landing.id}`);
      expect(afterRemove.status).toBe(200);
      const body = (afterRemove.body as { data: { cover: unknown } }).data;
      expect(body.cover).toBeNull();
    });
  });
});
