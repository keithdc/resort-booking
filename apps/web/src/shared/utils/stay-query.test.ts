/**
 * @file apps/web/src/shared/utils/stay-query.test.ts
 * @shared Stay URL helpers
 * @dependencies stay-query
 */

import { describe, expect, it } from 'vitest';
import { houseHref, searchHref, stayQueryFromRecord, withDefaultStay } from './stay-query';

describe('stay-query', (): void => {
  it('builds a search URL', (): void => {
    expect(
      searchHref({
        checkIn: '2026-09-20',
        checkOut: '2026-09-22',
        nights: '2',
        guestCount: '2',
        propertySlug: 'pine-coast',
      }),
    ).toBe('/search?checkIn=2026-09-20&checkOut=2026-09-22&nights=2&guestCount=2&property=pine-coast');
  });

  it('appends stay params on a house URL', (): void => {
    expect(
      houseHref('pine-coast', 'dune-house', {
        checkIn: '2026-09-20',
        checkOut: '2026-09-22',
        nights: '2',
        guestCount: '4',
        propertySlug: 'pine-coast',
      }),
    ).toContain('checkIn=2026-09-20');
  });

  it('reads query records', (): void => {
    expect(stayQueryFromRecord({ guestCount: '3' }).guestCount).toBe('3');
  });

  it('fills a one-night stay when dates are empty', (): void => {
    const stay = withDefaultStay({
      checkIn: '',
      checkOut: '',
      nights: '',
      guestCount: '',
      propertySlug: '',
    });
    expect(stay.nights).toBe('1');
    expect(stay.checkOut > stay.checkIn).toBe(true);
    expect(stay.guestCount).toBe('2');
  });

  it('uses nights to set checkout', (): void => {
    const stay = withDefaultStay({
      checkIn: '2026-09-16',
      checkOut: '',
      nights: '3',
      guestCount: '2',
      propertySlug: '',
    });
    expect(stay.checkOut).toBe('2026-09-19');
  });

  it('omits the property query when the slug is empty', (): void => {
    expect(
      searchHref({
        checkIn: '2026-09-20',
        checkOut: '2026-09-21',
        nights: '1',
        guestCount: '2',
        propertySlug: '',
      }),
    ).toBe('/search?checkIn=2026-09-20&checkOut=2026-09-21&nights=1&guestCount=2');
  });

  it('returns a bare house path when stay dates are missing', (): void => {
    expect(houseHref('pine-coast', 'dune-house', null)).toBe('/properties/pine-coast/stays/dune-house');
    expect(
      houseHref('pine-coast', 'dune-house', {
        checkIn: '',
        checkOut: '',
        nights: '1',
        guestCount: '2',
        propertySlug: 'pine-coast',
      }),
    ).toBe('/properties/pine-coast/stays/dune-house');
  });

  it('defaults missing query fields', (): void => {
    const stay = stayQueryFromRecord({});
    expect(stay.guestCount).toBe('2');
    expect(stay.checkIn).toBe('');
    expect(stay.propertySlug).toBe('');
  });

  it('clamps oversized night counts when filling defaults', (): void => {
    const stay = withDefaultStay({
      checkIn: '2026-09-16',
      checkOut: '',
      nights: '99',
      guestCount: '2',
      propertySlug: '',
    });
    expect(stay.nights).toBe('30');
    expect(stay.checkOut).toBe('2026-10-16');
  });
});
