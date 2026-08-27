import { INestApplication } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Test } from '@nestjs/testing';
import { StartedTestContainer } from 'testcontainers';
import { Repository } from 'typeorm';
import { Client } from '../src/modules/clients/domain/client.entity';
import { ClientContact } from '../src/modules/clients/domain/client-contact.entity';
import { ClientContactType } from '../src/modules/clients/enums/client-contact-type.enum';
import { ClientLeadType } from '../src/modules/clients/enums/client-lead-type.enum';
import { ClientLeadsRepository } from '../src/modules/clients/infrastructure/client-leads.repository';
import { runTestMigrations, startTestDatabase } from './support/test-database';

// Дедупликация/автослияние клиентов (ТЗ §9 — "unit", но CLAUDE.md §6 требует реальный Postgres,
// не моки, для всех обязательных тестов проекта) — против реального testcontainers-Postgres,
// на уровне репозитория, без HTTP.
describe('Client dedup and auto-merge (e2e)', () => {
  let app: INestApplication;
  let postgres: StartedTestContainer;
  let clientLeadsRepository: ClientLeadsRepository;
  let clientRepo: Repository<Client>;
  let clientContactRepo: Repository<ClientContact>;

  function submitInput(overrides: {
    phoneRaw: string;
    emailRaw?: string | null;
    name?: string;
  }) {
    return {
      type: ClientLeadType.PARTNER,
      name: overrides.name ?? 'Тест Тестов',
      phoneRaw: overrides.phoneRaw,
      emailRaw: overrides.emailRaw ?? null,
      message: null,
      comment: null,
      utm: null,
      payload: {},
      bitrixPayload: {},
    };
  }

  beforeAll(async () => {
    postgres = await startTestDatabase();
    await runTestMigrations();

    // Отложенная загрузка только для AppModule — см. комментарий в auth.e2e-spec.ts.
    const { AppModule } =
      require('../src/app.module') as typeof import('../src/app.module');

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    clientLeadsRepository = moduleRef.get(ClientLeadsRepository);
    clientRepo = moduleRef.get(getRepositoryToken(Client));
    clientContactRepo = moduleRef.get(getRepositoryToken(ClientContact));
  }, 60_000);

  afterAll(async () => {
    await app.close();
    await postgres.stop();
  });

  it('разные телефоны — разные клиенты', async () => {
    const leadA = await clientLeadsRepository.submitLead(
      submitInput({ phoneRaw: '79991110001' }),
    );
    const leadB = await clientLeadsRepository.submitLead(
      submitInput({ phoneRaw: '79991110002' }),
    );

    expect(leadA.clientId).not.toBe(leadB.clientId);
  });

  it('тот же телефон, разные email в последующих заявках — один и тот же клиент, без слияния', async () => {
    const first = await clientLeadsRepository.submitLead(
      submitInput({ phoneRaw: '79991110010' }),
    );
    const second = await clientLeadsRepository.submitLead(
      submitInput({ phoneRaw: '79991110010', emailRaw: 'first@example.com' }),
    );
    const third = await clientLeadsRepository.submitLead(
      submitInput({ phoneRaw: '79991110010', emailRaw: 'second@example.com' }),
    );

    expect(second.clientId).toBe(first.clientId);
    expect(third.clientId).toBe(first.clientId);

    const client = await clientRepo.findOneByOrFail({ id: first.clientId });
    expect(client.leadsCount).toBe(3);
    expect(client.isMerged).toBe(false);

    const contacts = await clientContactRepo.find({
      where: { clientId: first.clientId },
    });
    expect(contacts).toHaveLength(3); // 1 телефон + 2 email
  });

  it('телефон указывает на клиента A, email — на клиента B: автослияние, id поменьше побеждает', async () => {
    // A создан первым (только телефон) — его id гарантированно меньше id клиента B (SERIAL монотонно
    // растёт), значит A и есть ожидаемый primary после слияния.
    const leadA = await clientLeadsRepository.submitLead(
      submitInput({ phoneRaw: '79991110020', name: 'Клиент А' }),
    );
    const leadB = await clientLeadsRepository.submitLead(
      submitInput({
        phoneRaw: '79991110021',
        emailRaw: 'merge-target@example.com',
        name: 'Клиент Б',
      }),
    );
    const primaryId = leadA.clientId;
    const duplicateId = leadB.clientId;
    expect(primaryId).toBeLessThan(duplicateId);

    // Телефон A + email B в одной заявке — сводит их вместе, запускает автослияние.
    const mergingLead = await clientLeadsRepository.submitLead(
      submitInput({
        phoneRaw: '79991110020',
        emailRaw: 'merge-target@example.com',
        name: 'Слияние',
      }),
    );
    expect(mergingLead.clientId).toBe(primaryId);

    const duplicate = await clientRepo.findOneBy({ id: duplicateId });
    expect(duplicate?.isMerged).toBe(true);
    expect(duplicate?.mergedIntoClientId).toBe(primaryId);

    const primary = await clientRepo.findOneByOrFail({ id: primaryId });
    expect(primary.isMerged).toBe(false);
    expect(primary.leadsCount).toBe(3); // A(1) + B(1), слитые, + сама сливающая заявка(1)

    const primaryContacts = await clientContactRepo.find({
      where: { clientId: primaryId },
    });
    const phoneValues = primaryContacts
      .filter((c) => c.type === ClientContactType.PHONE)
      .map((c) => c.value);
    const emailValues = primaryContacts
      .filter((c) => c.type === ClientContactType.EMAIL)
      .map((c) => c.value);
    expect(phoneValues).toEqual(
      expect.arrayContaining(['79991110020', '79991110021']),
    );
    expect(emailValues).toContain('merge-target@example.com');
  });

  it('гонка: два одновременных сабмита, сводящих одну и ту же пару клиентов — leadsCount не задваивается', async () => {
    const leadA = await clientLeadsRepository.submitLead(
      submitInput({ phoneRaw: '79991110030', name: 'Клиент A2' }),
    );
    const leadB = await clientLeadsRepository.submitLead(
      submitInput({
        phoneRaw: '79991110031',
        emailRaw: 'race-merge@example.com',
        name: 'Клиент Б2',
      }),
    );
    const primaryId = leadA.clientId;
    const duplicateId = leadB.clientId;
    expect(primaryId).toBeLessThan(duplicateId);

    // Обе заявки одновременно сводят телефон A2 и email Б2 — без блокировки строк (FOR UPDATE)
    // обе транзакции читают ещё не смерженного дубля и добавили бы его leadsCount дважды.
    const [mergingLeadOne, mergingLeadTwo] = await Promise.all([
      clientLeadsRepository.submitLead(
        submitInput({
          phoneRaw: '79991110030',
          emailRaw: 'race-merge@example.com',
          name: 'Гонка 1',
        }),
      ),
      clientLeadsRepository.submitLead(
        submitInput({
          phoneRaw: '79991110030',
          emailRaw: 'race-merge@example.com',
          name: 'Гонка 2',
        }),
      ),
    ]);

    expect(mergingLeadOne.clientId).toBe(primaryId);
    expect(mergingLeadTwo.clientId).toBe(primaryId);

    const duplicate = await clientRepo.findOneBy({ id: duplicateId });
    expect(duplicate?.isMerged).toBe(true);
    expect(duplicate?.mergedIntoClientId).toBe(primaryId);

    const primary = await clientRepo.findOneByOrFail({ id: primaryId });
    // A(1) + B(1), слитые один раз (не дважды) + 2 гоночные заявки = 4, не 5.
    expect(primary.leadsCount).toBe(4);
  });

  it('гонка: два одновременных сабмита с одним и тем же НОВЫМ телефоном — один клиент, оба лида сохраняются (Б1)', async () => {
    const [leadOne, leadTwo] = await Promise.all([
      clientLeadsRepository.submitLead(
        submitInput({ phoneRaw: '79991110040', name: 'Гонка новый 1' }),
      ),
      clientLeadsRepository.submitLead(
        submitInput({ phoneRaw: '79991110040', name: 'Гонка новый 2' }),
      ),
    ]);

    expect(leadOne.clientId).toBe(leadTwo.clientId);

    const client = await clientRepo.findOneByOrFail({ id: leadOne.clientId });
    expect(client.leadsCount).toBe(2);

    const contacts = await clientContactRepo.find({
      where: { type: ClientContactType.PHONE, value: '79991110040' },
    });
    expect(contacts).toHaveLength(1);
  });
});
