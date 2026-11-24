/**
 * @file apps/admin/src/features/reporting/utils/attention-items.test.ts
 * @feature reporting
 */

import { describe, expect, it } from 'vitest';
import { buildAttentionItems } from './attention-items';

const ZERO = { unpaidHoldCount: 0, refundsToPayCount: 0, refundsToPayCents: 0, arrivalsTodayCount: 0, arrivalsNext7DaysCount: 0 };

describe('buildAttentionItems', () => {
  it('is empty when nothing needs a person', () => {
    expect(buildAttentionItems(ZERO, 'EUR')).toEqual([]);
  });

  it('lists only the items with something to do, in order', () => {
    const items = buildAttentionItems({ ...ZERO, refundsToPayCount: 2, refundsToPayCents: 15000, arrivalsNext7DaysCount: 4 }, 'EUR');

    expect(items.map((item) => item.key)).toEqual(['refundsToPay', 'arrivalsNext7Days']);
    expect(items[0]?.text).toBe('2 refunds to pay');
    expect(items[0]?.href).toBe('/refunds');
    expect(items[1]?.text).toBe('4 arrivals in the next 7 days');
  });

  it('uses the singular for one', () => {
    const items = buildAttentionItems({ ...ZERO, unpaidHoldCount: 1, arrivalsTodayCount: 1, refundsToPayCount: 1, refundsToPayCents: 500 }, 'EUR');

    expect(items.map((item) => item.text)).toEqual(['1 unpaid hold', '1 refund to pay', '1 arrival today']);
  });

  it('opens the bookings tab for unpaid holds and another page for the rest', () => {
    const [holds, refunds, today] = buildAttentionItems({ unpaidHoldCount: 1, refundsToPayCount: 1, refundsToPayCents: 100, arrivalsTodayCount: 1, arrivalsNext7DaysCount: 0 }, 'EUR');

    expect(holds).toMatchObject({ tab: 'bookings', href: null });
    expect(refunds).toMatchObject({ tab: null, href: '/refunds' });
    expect(today).toMatchObject({ tab: null, href: '/' });
  });

  it('shows the money still to send for refunds', () => {
    const [refunds] = buildAttentionItems({ ...ZERO, refundsToPayCount: 2, refundsToPayCents: 15000 }, 'EUR');
    expect(refunds?.detail).toContain('150');
    expect(refunds?.detail).toContain('to send back');
  });
});
