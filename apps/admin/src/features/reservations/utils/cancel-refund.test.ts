/**
 * @file apps/admin/src/features/reservations/utils/cancel-refund.test.ts
 * @feature reservations
 */

import type { StaffCancelPreview } from '@resort-booking/shared-types';
import { describe, expect, it } from 'vitest';
import { chosenRefund, confirmCancelLabel, isCancelReason, MAX_NOTE_LENGTH, noteProblem } from './cancel-refund';

const preview: StaffCancelPreview = {
  reservationId: 'r1',
  reference: 'BK-ABC1234567',
  paidCents: 96000,
  currencyCode: 'EUR',
  canCancel: true,
  blockedReason: null,
  notice: null,
  policyRefund: { paidCents: 96000, refundPercent: 75, refundCents: 72000, currencyCode: 'EUR', daysBeforeCheckIn: 4 },
};

const plain = (text: string): string => text.replace(/\s/g, ' ');

describe('chosenRefund', () => {
  it('refunds what the saved policy says when the guest asked', () => {
    expect(chosenRefund('guest_request', preview, '')).toEqual({ cents: 72000, error: null });
  });

  it('refunds nothing for a guest request when the booking has no refund ladder', () => {
    expect(chosenRefund('guest_request', { ...preview, policyRefund: null }, '')).toEqual({ cents: 0, error: null });
  });

  it('refunds everything paid when the property cannot host', () => {
    expect(chosenRefund('property_cancelled', preview, '')).toEqual({ cents: 96000, error: null });
  });

  it('refunds exactly the goodwill amount staff typed', () => {
    expect(chosenRefund('goodwill', preview, '250')).toEqual({ cents: 25000, error: null });
    expect(chosenRefund('goodwill', preview, '49,90')).toEqual({ cents: 4990, error: null });
  });

  it('allows goodwill of zero and of exactly what was paid', () => {
    expect(chosenRefund('goodwill', preview, '0').cents).toBe(0);
    expect(chosenRefund('goodwill', preview, '960').cents).toBe(96000);
  });

  it('refuses a goodwill amount above what the guest paid, naming the limit', () => {
    const result = chosenRefund('goodwill', preview, '960,01');

    expect(result.cents).toBeNull();
    expect(plain(result.error ?? '')).toContain('960,00 €');
  });

  it.each(['', 'abc', '-10', '12.345', '1e3'])('refuses the goodwill amount %j with a clear message', (value) => {
    const result = chosenRefund('goodwill', preview, value);

    expect(result.cents).toBeNull();
    expect(result.error).toContain('amount in euros');
  });

  it('ignores whatever is in the goodwill field for the other reasons', () => {
    expect(chosenRefund('guest_request', preview, 'garbage').error).toBeNull();
    expect(chosenRefund('property_cancelled', preview, 'garbage').error).toBeNull();
  });
});

describe('isCancelReason', () => {
  it('accepts exactly the three reasons', () => {
    expect(isCancelReason('guest_request')).toBe(true);
    expect(isCancelReason('property_cancelled')).toBe(true);
    expect(isCancelReason('goodwill')).toBe(true);
  });

  it.each(['', 'dates_changed', 'Goodwill', 'refund'])('refuses %j', (value) => {
    expect(isCancelReason(value)).toBe(false);
  });
});

describe('noteProblem', () => {
  it('needs a few real characters', () => {
    expect(noteProblem('')).not.toBeNull();
    expect(noteProblem('  ab  ')).not.toBeNull();
    expect(noteProblem('abc')).toBeNull();
  });

  it('has an upper limit', () => {
    expect(noteProblem('x'.repeat(MAX_NOTE_LENGTH))).toBeNull();
    expect(noteProblem('x'.repeat(MAX_NOTE_LENGTH + 1))).not.toBeNull();
  });
});

describe('confirmCancelLabel', () => {
  it('states the exact refund or that there is none', () => {
    expect(plain(confirmCancelLabel(12000, 'EUR'))).toBe('Cancel and refund 120,00 €');
    expect(confirmCancelLabel(0, 'EUR')).toBe('Cancel with no refund');
  });

  it('falls back to a plain label while the amount is not valid', () => {
    expect(confirmCancelLabel(null, 'EUR')).toBe('Cancel booking');
  });
});
