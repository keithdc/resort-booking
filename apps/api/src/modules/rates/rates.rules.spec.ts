/**
 * @file apps/api/src/modules/rates/rates.rules.spec.ts
 * @feature rates
 * @dependencies rates.rules
 */

import type { RatePeriod } from '@resort-booking/shared-types';
import {
  describeConflict,
  findPeriodConflict,
  MAX_PRICED_NIGHTS,
  priceStay,
  STANDARD_RATE_LABEL,
  stayNights,
  validatePeriodWrite,
} from './rates.rules';

const PEAK = { label: 'Peak summer', startDate: '2027-07-01', endDate: '2027-08-31', nightlyRateCents: 26000 };

function period(id: string, startDate: string, endDate: string): RatePeriod {
  return { id, houseId: 'h', propertyId: 'p', label: `Period ${id}`, startDate, endDate, nightlyRateCents: 20000 };
}

describe('stayNights', () => {
  it('lists check-in through the night before check-out', () => {
    expect(stayNights('2027-06-29', '2027-07-02')).toEqual(['2027-06-29', '2027-06-30', '2027-07-01']);
  });

  it('returns nothing for inverted, same-day, or invalid ranges', () => {
    expect(stayNights('2027-07-02', '2027-06-29')).toEqual([]);
    expect(stayNights('2027-07-01', '2027-07-01')).toEqual([]);
    expect(stayNights('2027-02-30', '2027-03-02')).toEqual([]);
    expect(stayNights('nope', '2027-03-02')).toEqual([]);
  });

  it('refuses an absurdly long stay instead of building a huge list', () => {
    expect(stayNights('2027-01-01', '2029-01-01')).toEqual([]);
    expect(stayNights('2027-01-01', '2027-12-30').length).toBeLessThanOrEqual(MAX_PRICED_NIGHTS);
  });
});

describe('priceStay', () => {
  it('uses the standard rate when no period applies', () => {
    const result = priceStay(stayNights('2027-06-10', '2027-06-13'), 18000, [PEAK]);
    expect(result).toEqual({
      lines: [{ label: STANDARD_RATE_LABEL, nights: 3, nightlyRateCents: 18000, subtotalCents: 54000 }],
      totalCents: 54000,
    });
  });

  it('uses the period rate for every night inside it', () => {
    const result = priceStay(stayNights('2027-07-10', '2027-07-12'), 18000, [PEAK]);
    expect(result.totalCents).toBe(52000);
    expect(result.lines).toEqual([{ label: 'Peak summer', nights: 2, nightlyRateCents: 26000, subtotalCents: 52000 }]);
  });

  it('prices a stay that crosses into peak season night by night', () => {
    const result = priceStay(stayNights('2027-06-29', '2027-07-03'), 18000, [PEAK]);
    expect(result.lines).toEqual([
      { label: STANDARD_RATE_LABEL, nights: 2, nightlyRateCents: 18000, subtotalCents: 36000 },
      { label: 'Peak summer', nights: 2, nightlyRateCents: 26000, subtotalCents: 52000 },
    ]);
    expect(result.totalCents).toBe(88000);
  });

  it('treats the first and last night of a period as inside it', () => {
    expect(priceStay(['2027-07-01'], 18000, [PEAK]).totalCents).toBe(26000);
    expect(priceStay(['2027-08-31'], 18000, [PEAK]).totalCents).toBe(26000);
    expect(priceStay(['2027-06-30'], 18000, [PEAK]).totalCents).toBe(18000);
    expect(priceStay(['2027-09-01'], 18000, [PEAK]).totalCents).toBe(18000);
  });

  it('keeps back-to-back periods with different rates as separate lines', () => {
    const periods = [
      { label: 'Shoulder', startDate: '2027-06-01', endDate: '2027-06-30', nightlyRateCents: 21000 },
      PEAK,
    ];
    const result = priceStay(stayNights('2027-06-30', '2027-07-02'), 18000, periods);
    expect(result.lines.map((line) => line.label)).toEqual(['Shoulder', 'Peak summer']);
    expect(result.totalCents).toBe(47000);
  });

  it('allows a free period', () => {
    const free = [{ label: 'Owner stay', startDate: '2027-06-10', endDate: '2027-06-12', nightlyRateCents: 0 }];
    expect(priceStay(['2027-06-10', '2027-06-11'], 18000, free).totalCents).toBe(0);
  });

  it('returns an empty price for no nights or an invalid standard rate', () => {
    expect(priceStay([], 18000, [PEAK])).toEqual({ lines: [], totalCents: 0 });
    expect(priceStay(['2027-06-10'], -1, [])).toEqual({ lines: [], totalCents: 0 });
    expect(priceStay(['2027-06-10'], 18000.5, [])).toEqual({ lines: [], totalCents: 0 });
  });

  it('keeps line subtotals adding up to the total', () => {
    const result = priceStay(stayNights('2027-06-25', '2027-07-08'), 17550, [PEAK]);
    expect(result.lines.reduce((sum, line) => sum + line.subtotalCents, 0)).toBe(result.totalCents);
  });
});

describe('findPeriodConflict', () => {
  const existing = [period('a', '2027-07-01', '2027-07-31')];

  it('finds an overlapping range and names it', () => {
    expect(findPeriodConflict(existing, { startDate: '2027-07-15', endDate: '2027-08-15' }, null)).toEqual({
      label: 'Period a',
      startDate: '2027-07-01',
      endDate: '2027-07-31',
    });
  });

  it('treats sharing a single night as a conflict', () => {
    expect(findPeriodConflict(existing, { startDate: '2027-07-31', endDate: '2027-08-10' }, null)).not.toBeNull();
    expect(findPeriodConflict(existing, { startDate: '2027-06-20', endDate: '2027-07-01' }, null)).not.toBeNull();
  });

  it('allows back-to-back ranges and gaps', () => {
    expect(findPeriodConflict(existing, { startDate: '2027-08-01', endDate: '2027-08-31' }, null)).toBeNull();
    expect(findPeriodConflict(existing, { startDate: '2027-06-01', endDate: '2027-06-30' }, null)).toBeNull();
  });

  it('catches a candidate that contains or sits inside an existing period', () => {
    expect(findPeriodConflict(existing, { startDate: '2027-06-01', endDate: '2027-12-31' }, null)).not.toBeNull();
    expect(findPeriodConflict(existing, { startDate: '2027-07-10', endDate: '2027-07-12' }, null)).not.toBeNull();
  });

  it('ignores the period being edited so it can keep its own dates', () => {
    expect(findPeriodConflict(existing, { startDate: '2027-07-05', endDate: '2027-07-20' }, 'a')).toBeNull();
  });

  it('finds nothing when there are no periods', () => {
    expect(findPeriodConflict([], { startDate: '2027-07-05', endDate: '2027-07-20' }, null)).toBeNull();
  });

  it('writes a message that names the clashing period', () => {
    expect(describeConflict({ label: 'Peak', startDate: '2027-07-01', endDate: '2027-07-31' })).toContain('"Peak"');
  });
});

describe('validatePeriodWrite', () => {
  it('accepts a good period', () => {
    expect(validatePeriodWrite(PEAK)).toBeNull();
  });

  it('accepts a one-night period', () => {
    expect(validatePeriodWrite({ ...PEAK, startDate: '2027-12-31', endDate: '2027-12-31' })).toBeNull();
  });

  it('rejects a blank or oversized name', () => {
    expect(validatePeriodWrite({ ...PEAK, label: '   ' })).not.toBeNull();
    expect(validatePeriodWrite({ ...PEAK, label: 'x'.repeat(81) })).not.toBeNull();
  });

  it('rejects an end before the start and impossible dates', () => {
    expect(validatePeriodWrite({ ...PEAK, endDate: '2027-06-30' })).not.toBeNull();
    expect(validatePeriodWrite({ ...PEAK, startDate: '2027-02-30' })).not.toBeNull();
  });

  it('rejects negative and fractional rates', () => {
    expect(validatePeriodWrite({ ...PEAK, nightlyRateCents: -1 })).not.toBeNull();
    expect(validatePeriodWrite({ ...PEAK, nightlyRateCents: 100.5 })).not.toBeNull();
  });
});
