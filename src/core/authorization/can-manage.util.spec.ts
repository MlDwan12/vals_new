import { canAssignRole, canManageTargetUser } from './can-manage.util';

describe('canManageTargetUser', () => {
  it('разрешает управление тем, кто ниже по рангу', () => {
    expect(
      canManageTargetUser(
        { rank: 80, isSystem: false, permissions: new Set() },
        { rank: 40, isSystem: false },
      ),
    ).toBe(true);
  });

  it('разрешает управление тем же рангом (не строго ниже)', () => {
    expect(
      canManageTargetUser(
        { rank: 40, isSystem: false, permissions: new Set() },
        { rank: 40, isSystem: false },
      ),
    ).toBe(true);
  });

  it('запрещает управление тем, кто выше по рангу', () => {
    expect(
      canManageTargetUser(
        { rank: 40, isSystem: false, permissions: new Set() },
        { rank: 80, isSystem: false },
      ),
    ).toBe(false);
  });

  // is_system — байпас любой проверки прав (EXPANSION_TASKS.md §1.1), распространяется и сюда.
  it('is_system-актёр управляет кем угодно, независимо от ранга', () => {
    expect(
      canManageTargetUser(
        { rank: 1, isSystem: true, permissions: new Set() },
        { rank: 1000, isSystem: false },
      ),
    ).toBe(true);
  });

  // /security-review: та же асимметрия, что была в canAssignRole до altitude-ревью — без явной
  // проверки target.isSystem не-системный актёр с достаточным рангом мог бы управлять
  // пользователем с системной ролью, если бы та роль когда-либо оказалась не максимального ранга.
  it('запрещает не-системному актёру управлять пользователем с системной ролью, даже с низким рангом цели', () => {
    expect(
      canManageTargetUser(
        { rank: 100, isSystem: false, permissions: new Set() },
        { rank: 10, isSystem: true },
      ),
    ).toBe(false);
  });
});

describe('canAssignRole', () => {
  it('разрешает назначить роль ниже своего ранга с подмножеством своих прав', () => {
    const actor = {
      rank: 80,
      isSystem: false,
      permissions: new Set(['articles.write', 'cases.write'] as const),
    };
    const role = {
      rank: 40,
      isSystem: false,
      permissions: new Set(['articles.write'] as const),
    };
    expect(canAssignRole(actor, role)).toBe(true);
  });

  it('запрещает роль с рангом выше своего, даже если прав в ней меньше', () => {
    const actor = {
      rank: 40,
      isSystem: false,
      permissions: new Set(['articles.write'] as const),
    };
    const role = {
      rank: 80,
      isSystem: false,
      permissions: new Set(['articles.write'] as const),
    };
    expect(canAssignRole(actor, role)).toBe(false);
  });

  // §1.3: второй барьер нужен именно потому, что ранг сам по себе не гарантирует, что у роли
  // нет права, которого нет у актёра — роль ранга 20 в принципе может держать право, которого
  // нет у роли ранга 50.
  it('запрещает роль с рангом не выше своего, но с правом, которого нет у актёра', () => {
    const actor = {
      rank: 80,
      isSystem: false,
      permissions: new Set(['articles.write'] as const),
    };
    const role = {
      rank: 20,
      isSystem: false,
      permissions: new Set(['roles.manage'] as const),
    };
    expect(canAssignRole(actor, role)).toBe(false);
  });

  it('разрешает роль без единого права (пустой набор — подмножество чего угодно)', () => {
    const actor = { rank: 40, isSystem: false, permissions: new Set() };
    const role = { rank: 40, isSystem: false, permissions: new Set() };
    expect(canAssignRole(actor, role)).toBe(true);
  });

  // is_system — тот же байпас, что и в canManageTargetUser: держатель системной роли уже проходит
  // любой @Perm()-гейт выше по стеку, блокировать его тем же набором прав здесь противоречиво.
  it('is_system-актёр может назначить роль выше своего ранга и с любыми правами', () => {
    const actor = { rank: 1, isSystem: true, permissions: new Set() };
    const role = {
      rank: 1000,
      isSystem: false,
      permissions: new Set(['roles.manage'] as const),
    };
    expect(canAssignRole(actor, role)).toBe(true);
  });

  // Найдено независимым altitude-ревью: системная роль обычно держит ПУСТОЙ набор прав (байпас
  // делает role_permissions ненужным), поэтому без этой явной проверки не-системный актёр с
  // достаточным рангом мог бы назначить пользователю системную роль — пустой набор прав
  // тривиально проходит проверку подмножества.
  it('запрещает не-системному актёру назначить системную роль, даже с пустым набором прав', () => {
    const actor = {
      rank: 100,
      isSystem: false,
      permissions: new Set(['roles.manage', 'users.manage'] as const),
    };
    const systemRole = { rank: 10, isSystem: true, permissions: new Set() };
    expect(canAssignRole(actor, systemRole)).toBe(false);
  });
});
