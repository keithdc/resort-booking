/**
 * @file apps/api/src/shared/validation/uuid-like.spec.ts
 * @shared Seed-friendly id pattern
 */

import { UUID_LIKE } from './uuid-like';

describe('UUID_LIKE', (): void => {
  it('accepts hyphenated seed ids that are not RFC variants', (): void => {
    expect(UUID_LIKE.test('22222222-2222-2222-2222-222222222221')).toBe(true);
    expect(UUID_LIKE.test('11111111-1111-1111-1111-111111111111')).toBe(true);
    expect(UUID_LIKE.test('33333333-3333-3333-3333-333333333332')).toBe(true);
  });

  it('rejects empty, short, and unhyphenated values', (): void => {
    expect(UUID_LIKE.test('')).toBe(false);
    expect(UUID_LIKE.test('not-a-uuid')).toBe(false);
    expect(UUID_LIKE.test('222222222222222222222222222222222221')).toBe(false);
    expect(UUID_LIKE.test('all')).toBe(false);
  });
});
