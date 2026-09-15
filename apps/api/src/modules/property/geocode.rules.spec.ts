/**
 * @file apps/api/src/modules/property/geocode.rules.spec.ts
 * @feature property
 * @dependencies geocode.rules
 */

import type { GeocodeHit } from '@resort-booking/shared-types';
import { mergeReverseHits } from './geocode.rules';

describe('mergeReverseHits', (): void => {
  it('fills empty town, postcode, and country from the fallback hit', (): void => {
    const streetOnly = stubHit({ addressLine: '8 Route du Lac', city: '', postalCode: '', countryCode: '' });
    const place = stubHit({
      addressLine: '',
      city: 'Annecy',
      postalCode: '74000',
      countryCode: 'FR',
    });
    const merged = mergeReverseHits(streetOnly, place);
    expect(merged?.addressLine).toBe('8 Route du Lac');
    expect(merged?.city).toBe('Annecy');
    expect(merged?.postalCode).toBe('74000');
    expect(merged?.countryCode).toBe('FR');
  });
});

function stubHit(partial: Partial<GeocodeHit>): GeocodeHit {
  return {
    label: 'hit',
    addressLine: '',
    city: '',
    postalCode: '',
    countryCode: '',
    latitude: 45.9,
    longitude: 6.1,
    ...partial,
  };
}
