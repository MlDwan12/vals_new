import { escapeLikePattern } from './escape-like-pattern.util';

describe('escapeLikePattern', () => {
  it('экранирует %, _ и \\ обратным слэшем', () => {
    expect(escapeLikePattern('john_doe%test\\x')).toBe(
      'john\\_doe\\%test\\\\x',
    );
  });

  it('не трогает строки без спецсимволов', () => {
    expect(escapeLikePattern('john.doe@example.com')).toBe(
      'john.doe@example.com',
    );
  });
});
