/**
 * @file apps/admin/src/features/reporting/utils/attention-items.test.ts
 * @feature reporting
 */

import { describe, expect, it } from 'vitest';
import { buildAttentionItems } from './attention-items';

const ZERO = { unpaidHoldCount: 0, refundsToPayCount: 0, refundsToPayCents: 0, arrivalsTodayCount: 0, arrivalsNext7DaysCount: 0, unpaidAtHotelCount: 0, unpaidAtHotelCents: 0, unpaidAtHotelArrivalsNext7DaysCount: 0, unpaidAtHotelPastCount: 0 };

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
    const [holds, refunds, today] = buildAttentionItems({ ...ZERO, unpaidHoldCount: 1, refundsToPayCount: 1, refundsToPayCents: 100, arrivalsTodayCount: 1 }, 'EUR');

    expect(holds).toMatchObject({ tab: 'bookings', href: null, filter: 'awaiting_payment' });
    expect(refunds).toMatchObject({ tab: null, href: '/refunds' });
    expect(today).toMatchObject({ tab: null, href: '/' });
  });

  it('lists the bookings unpaid at the hotel with what is to collect, who arrives soon and who already passed check-in', () => {
    const [unpaid] = buildAttentionItems(
      { ...ZERO, unpaidAtHotelCount: 3, unpaidAtHotelCents: 240000, unpaidAtHotelArrivalsNext7DaysCount: 2, unpaidAtHotelPastCount: 1 },
      'EUR',
    );

    expect(unpaid).toMatchObject({ key: 'unpaidAtHotel', text: '3 unpaid at hotel', tab: 'bookings', filter: 'unpaid_at_hotel', href: null });
    expect(unpaid?.detail).toMatch(/2.400,00/);
    expect(unpaid?.detail).toContain('to collect');
    expect(unpaid?.detail).toContain('2 arriving within 7 days');
    expect(unpaid?.detail).toContain('1 already past check-in');
  });

  it('leaves the money out of the unpaid-at-hotel line for someone who does not see money', () => {
    const [unpaid] = buildAttentionItems({ ...ZERO, unpaidAtHotelCount: 2, unpaidAtHotelArrivalsNext7DaysCount: 1 }, 'EUR', true);

    expect(unpaid?.detail).toBe('1 arriving within 7 days');
    expect(buildAttentionItems({ ...ZERO, unpaidAtHotelCount: 2 }, 'EUR', true)[0]?.detail).toBeNull();
  });

  it('shows the money still to send for refunds', () => {
    const [refunds] = buildAttentionItems({ ...ZERO, refundsToPayCount: 2, refundsToPayCents: 15000 }, 'EUR');
    expect(refunds?.detail).toContain('150');
    expect(refunds?.detail).toContain('to send back');
  });
});
