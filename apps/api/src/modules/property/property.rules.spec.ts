/**
 * @file apps/api/src/modules/property/property.rules.spec.ts
 * @feature property
 * @dependencies property.rules
 */

import { slugifyPropertyName } from './property.rules';

describe('property.rules', (): void => {
  it('slugifies resort names', (): void => {
    expect(slugifyPropertyName('Pine Coast Resort')).toBe('pine-coast-resort');
  });

  it('strips accents and punctuation', (): void => {
    expect(slugifyPropertyName('Château d’Annecy!')).toBe('chateau-d-annecy');
  });

  it('falls back when the name has no letters', (): void => {
    expect(slugifyPropertyName('***')).toBe('property');
    expect(slugifyPropertyName('   ')).toBe('property');
  });
});
