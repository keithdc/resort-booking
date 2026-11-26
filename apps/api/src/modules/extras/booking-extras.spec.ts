/**
 * @file apps/api/src/modules/extras/booking-extras.spec.ts
 * @feature extras
 * Pricing the extras chosen on a booking: instant adds price x quantity, a request adds nothing, and nothing the
 * property does not offer (or twice, or in the wrong currency) gets through.
 */

import type { ExtraService } from '@resort-booking/shared-types';
import { mapBookingExtra, priceExtras } from './booking-extras';

function extra(overrides: Partial<ExtraService> = {}): ExtraService {
  return { id: 'ex-1', organizationId: 'org', propertyId: 'prop', name: 'Breakfast basket', description: '', kind: 'instant', priceCents: 1800, currencyCode: 'EUR', published: true, ...overrides };
}

const OFFERED = [extra(), extra({ id: 'ex-2', name: 'Extra pillows', kind: 'on_request', priceCents: 0 }), extra({ id: 'ex-3', name: 'Free cot', priceCents: 0 })];

describe('priceExtras', () => {
  it('is empty and free for no choices', () => {
    expect(priceExtras(OFFERED, [], 'EUR')).toEqual({ ok: true, lines: [], extrasCents: 0 });
  });

  it('multiplies an instant extra by its quantity and charges nothing for a request', () => {
    const result = priceExtras(OFFERED, [{ extraId: 'ex-1', quantity: 3 }, { extraId: 'ex-2', quantity: 4 }], 'EUR');

    expect(result).toMatchObject({ ok: true, extrasCents: 5400 });
    expect(result.ok && result.lines.map((line) => [line.name, line.quantity, line.unitPriceCents, line.lineCents])).toEqual([
      ['Breakfast basket', 3, 1800, 5400],
      ['Extra pillows', 4, 0, 0],
    ]);
  });

  it('keeps the listed price of a request on its line even though it charges nothing now', () => {
    const result = priceExtras([extra({ id: 'r', kind: 'on_request', priceCents: 2500 })], [{ extraId: 'r', quantity: 2 }], 'EUR');

    expect(result.ok && result.lines[0]).toMatchObject({ unitPriceCents: 2500, lineCents: 0 });
    expect(result.ok && result.extrasCents).toBe(0);
  });

  it('refuses an extra that is not offered: this is also what another property\'s or organization\'s extra looks like', () => {
    expect(priceExtras(OFFERED, [{ extraId: 'other-property', quantity: 1 }], 'EUR')).toMatchObject({ ok: false, problem: { code: 'EXTRA_NOT_FOUND' } });
  });

  it('refuses the same extra twice', () => {
    expect(priceExtras(OFFERED, [{ extraId: 'ex-1', quantity: 1 }, { extraId: 'ex-1', quantity: 1 }], 'EUR')).toMatchObject({
      ok: false,
      problem: { code: 'DUPLICATE_EXTRA' },
    });
  });

  it('refuses a priced extra in another currency than the stay, but not a free one', () => {
    const usd = [extra({ currencyCode: 'USD' }), extra({ id: 'free', priceCents: 0, currencyCode: 'USD' })];

    expect(priceExtras(usd, [{ extraId: 'ex-1', quantity: 1 }], 'EUR')).toMatchObject({ ok: false, problem: { code: 'EXTRA_CURRENCY_MISMATCH' } });
    expect(priceExtras(usd, [{ extraId: 'free', quantity: 1 }], 'EUR')).toMatchObject({ ok: true, extrasCents: 0 });
  });
});

describe('mapBookingExtra', () => {
  it('turns a row into the camel-case shape', () => {
    expect(
      mapBookingExtra({ id: 'e', extra_service_id: null, name: 'Cot', kind: 'on_request', quantity: 1, unit_price_cents: 0, line_cents: 0, currency_code: 'EUR', status: 'pending' }),
    ).toEqual({ id: 'e', extraServiceId: null, name: 'Cot', kind: 'on_request', quantity: 1, unitPriceCents: 0, lineCents: 0, currencyCode: 'EUR', status: 'pending' });
  });
});
