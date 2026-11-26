/**
 * @file apps/admin/src/shared/utils/booking-labels.test.ts
 * @shared Staff wording helpers
 */

import { describe, expect, it } from 'vitest';
import { staffCancellation, staffChange, staffRefund } from '@/test/fixtures';
import {
  canMarkRefundPaid,
  canRetryRefund,
  cancellationSummary,
  changeSummary,
  formatDateTime,
  initiatorLabel,
  reasonLabel,
  refundKindLabel,
  refundStatusColor,
  refundStatusLabel,
  resolvedByHandText,
} from './booking-labels';

const plain = (text: string): string => text.replace(/\s/g, ' ');

describe('reasonLabel', () => {
  it.each([
    ['guest_request', 'Guest asked'],
    ['property_cancelled', 'We could not host'],
    ['goodwill', 'Goodwill'],
    ['dates_changed', 'Dates were changed'],
  ])('words %s as %s', (code, label) => {
    expect(reasonLabel(code)).toBe(label);
  });

  it('shows an unknown reason readably instead of hiding it', () => {
    expect(reasonLabel('force_majeure')).toBe('Force majeure');
  });

  it('says not recorded for an empty reason', () => {
    expect(reasonLabel('')).toBe('Not recorded');
    expect(reasonLabel('__')).toBe('Not recorded');
  });
});

describe('refund wording', () => {
  it('words the late-payment reason from the readable fallback', () => {
    expect(reasonLabel('late_payment')).toBe('Late payment');
  });

  it('names the kinds', () => {
    expect(refundKindLabel('cancellation')).toBe('Cancellation refund');
    expect(refundKindLabel('rebook_difference')).toBe('Date-change refund');
    expect(refundKindLabel('late_payment')).toBe('Late payment refund');
  });

  it('names and colours the statuses', () => {
    expect(refundStatusLabel('pending')).toBe('Pending');
    expect(refundStatusLabel('succeeded')).toBe('Done');
    expect(refundStatusLabel('failed')).toBe('Failed');
    expect(refundStatusColor('pending')).toBe('warning');
    expect(refundStatusColor('succeeded')).toBe('success');
    expect(refundStatusColor('failed')).toBe('error');
  });
});

describe('initiatorLabel and cancellationSummary', () => {
  it('names the guest or the staff member', () => {
    expect(initiatorLabel('guest', null)).toBe('the guest');
    expect(initiatorLabel('staff', 'Marie')).toBe('staff (Marie)');
  });

  it('still says staff when no name was recorded', () => {
    expect(initiatorLabel('staff', null)).toBe('staff');
    expect(initiatorLabel('staff', '  ')).toBe('staff');
  });

  it('summarises who cancelled and why', () => {
    expect(cancellationSummary(staffCancellation())).toBe('Cancelled by the guest: Guest asked');
    expect(cancellationSummary(staffCancellation({ initiatedBy: 'staff', staffName: 'Marie', reason: 'goodwill' }))).toBe(
      'Cancelled by staff (Marie): Goodwill',
    );
  });
});

describe('changeSummary', () => {
  it('shows the old and new dates with the fee and what the guest paid', () => {
    expect(plain(changeSummary(staffChange(), 'EUR'))).toBe(
      '2027-07-10 to 2027-07-12 → 2027-07-20 to 2027-07-23 (fee 20,00 €, guest paid 460,00 € more)',
    );
  });

  it('shows a refund of the difference', () => {
    const text = plain(changeSummary(staffChange({ feeCents: 0, payCents: 0, refundCents: 12000 }), 'EUR'));

    expect(text).toContain('120,00 € refunded');
    expect(text).not.toContain('fee');
  });

  it('shows just the dates when no money moved', () => {
    expect(changeSummary(staffChange({ feeCents: 0, payCents: 0, refundCents: 0 }), 'EUR')).toBe(
      '2027-07-10 to 2027-07-12 → 2027-07-20 to 2027-07-23',
    );
  });
});

describe('resolvedByHandText', () => {
  it('is null when nobody resolved it by hand', () => {
    expect(resolvedByHandText({ resolvedByName: null, resolutionNote: null })).toBeNull();
  });

  it('says who and how', () => {
    expect(resolvedByHandText({ resolvedByName: 'Marie', resolutionNote: 'Bank transfer 3 June' })).toBe(
      'Marked as sent by Marie: Bank transfer 3 June',
    );
  });

  it('copes with a missing name or note', () => {
    expect(resolvedByHandText({ resolvedByName: null, resolutionNote: 'cash' })).toBe('Marked as sent by Staff: cash');
    expect(resolvedByHandText({ resolvedByName: 'Marie', resolutionNote: null })).toBe('Marked as sent by Marie');
  });
});

describe('what staff can do with a refund', () => {
  it('retries a failed refund and a pending provider refund, but never a manual or done one', () => {
    expect(canRetryRefund(staffRefund({ status: 'failed', provider: 'mock' }))).toBe(true);
    expect(canRetryRefund(staffRefund({ status: 'failed', provider: 'manual' }))).toBe(true);
    expect(canRetryRefund(staffRefund({ status: 'pending', provider: 'mock' }))).toBe(true);
    expect(canRetryRefund(staffRefund({ status: 'pending', provider: 'manual' }))).toBe(false);
    expect(canRetryRefund(staffRefund({ status: 'succeeded', provider: 'mock' }))).toBe(false);
  });

  it('lets staff mark pending and failed refunds as sent, but not done ones', () => {
    expect(canMarkRefundPaid({ status: 'pending' })).toBe(true);
    expect(canMarkRefundPaid({ status: 'failed' })).toBe(true);
    expect(canMarkRefundPaid({ status: 'succeeded' })).toBe(false);
  });
});

describe('formatDateTime', () => {
  it('shows date and time in labelled UTC', () => {
    expect(formatDateTime('2027-05-01T10:30:00.000Z')).toBe('1 May 2027, 10:30 UTC');
  });

  it('returns unreadable input unchanged', () => {
    expect(formatDateTime('soon')).toBe('soon');
  });
});
