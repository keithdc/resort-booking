/**
 * @file apps/web/src/shared/utils/format-address.test.ts
 * @shared Guest address line
 */

import { describe, expect, it } from 'vitest';
import { formatAddress } from './format-address';

describe('formatAddress', (): void => {
  it('joins street, postcode, and city', (): void => {
    expect(formatAddress('8 Route du Lac', '74000', 'Annecy', 'FR')).toBe(
      '8 Route du Lac, 74000, Annecy · FR',
    );
  });

  it('omits blank parts and a missing country', (): void => {
    expect(formatAddress('', '74000', 'Annecy')).toBe('74000, Annecy');
    expect(formatAddress('   ', '', 'Annecy', '')).toBe('Annecy');
  });
});
