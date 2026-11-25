/**
 * @file apps/api/src/migrations/stackable-sample-discounts.spec.ts
 * Guards in migration 025: it may only touch the two seeded samples, still exactly as seeded.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const sql = readFileSync(join(__dirname, '025_stackable_sample_discounts.sql'), 'utf8');
const statements = sql
  .split(';')
  .map((part: string): string => part.replace(/^\s*--.*$/gm, '').trim())
  .filter((part: string): boolean => part.startsWith('UPDATE'));

describe('025_stackable_sample_discounts.sql', () => {
  it('has one update per seeded sample and nothing else', () => {
    expect(statements).toHaveLength(2);
    expect(sql).not.toMatch(/DELETE|INSERT|DROP/i);
  });

  it.each([
    ['Long stay: 7+ nights', "effect_value = 10", '"kind":"min_nights","nights":7'],
    ['Welcome code', 'effect_value = 15', '"kind":"promo_code","code":"WELCOME15"'],
  ])('only changes "%s" while it is still as seeded and not combinable', (label, value, condition) => {
    const statement = statements.find((text: string): boolean => text.includes(`label = '${label}'`));

    expect(statement).toBeDefined();
    expect(statement).toContain('SET combinable = true');
    expect(statement).toContain('combinable = false');
    expect(statement).toContain("effect_kind = 'percent'");
    expect(statement).toContain(value);
    expect(statement).toContain(condition);
  });
});
