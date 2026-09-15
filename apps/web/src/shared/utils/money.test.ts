/**
 * @file apps/web/src/shared/utils/money.test.ts
 * @shared Display formatting
 * @dependencies money
 */

import { describe, expect, it } from 'vitest';
import { formatCents } from './money';

describe('formatCents', (): void => {
  it('formats euro minor units', (): void => {
    expect(formatCents(24000, 'EUR')).toContain('240');
  });
});
