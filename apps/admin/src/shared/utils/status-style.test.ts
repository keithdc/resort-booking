/**
 * @file apps/admin/src/shared/utils/status-style.test.ts
 * @shared Status colour, icon and label mapping
 */

import { describe, expect, it } from 'vitest';
import { bookingFilterStyle, refundStyle, stayStatusStyle } from './status-style';

const base = { arrivalStatus: 'expected', rebookOfId: null } as const;

describe('stayStatusStyle', () => {
  it('shows a confirmed booking as booked, in-house or checked out', () => {
    expect(stayStatusStyle({ ...base, status: 'confirmed' })).toEqual({ label: 'Booked', tone: 'success', icon: 'booked' });
    expect(stayStatusStyle({ ...base, status: 'confirmed', arrivalStatus: 'checked_in' }).label).toBe('In-house');
    expect(stayStatusStyle({ ...base, status: 'confirmed', arrivalStatus: 'checked_out' })).toMatchObject({
      label: 'Checked out',
      tone: 'default',
    });
  });

  it('shows an unpaid hold as warning, cancelled and released as error', () => {
    expect(stayStatusStyle({ ...base, status: 'active' })).toMatchObject({ label: 'Hold', tone: 'warning', icon: 'hold' });
    expect(stayStatusStyle({ ...base, status: 'cancelled' })).toMatchObject({ label: 'Cancelled', tone: 'error' });
    expect(stayStatusStyle({ ...base, status: 'released' })).toMatchObject({ label: 'Released', tone: 'error' });
  });

  it('shows a live replacement booking as a rebook, but not a cancelled one', () => {
    expect(stayStatusStyle({ ...base, status: 'confirmed', rebookOfId: 'old' })).toMatchObject({ label: 'Rebook', tone: 'info' });
    expect(stayStatusStyle({ ...base, status: 'cancelled', rebookOfId: 'old' }).label).toBe('Cancelled');
  });

  it('keeps an expired hold neutral', () => {
    expect(stayStatusStyle({ ...base, status: 'expired' })).toMatchObject({ label: 'Expired', tone: 'default' });
  });
});

describe('bookingFilterStyle', () => {
  it('gives each of the four states its own icon', () => {
    const icons = (['confirmed', 'awaiting_payment', 'cancelled', 'expired'] as const).map((key) => bookingFilterStyle(key).icon);
    expect(new Set(icons).size).toBe(4);
    expect(bookingFilterStyle('awaiting_payment').tone).toBe('warning');
  });

  it('has its own words for the money still to collect at the hotel', () => {
    expect(bookingFilterStyle('unpaid_at_hotel')).toEqual({ label: 'Unpaid at hotel', tone: 'warning', icon: 'hold' });
  });
});

describe('refundStyle', () => {
  it('maps done, pending and failed', () => {
    expect(refundStyle('succeeded')).toEqual({ label: 'Done', tone: 'success', icon: 'refund-done' });
    expect(refundStyle('pending')).toMatchObject({ label: 'Pending', tone: 'warning' });
    expect(refundStyle('failed')).toMatchObject({ label: 'Failed', tone: 'error' });
  });
});
