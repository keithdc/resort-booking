/**
 * @file apps/admin/src/features/team/utils/audit-labels.test.ts
 * @feature team
 */

import { describe, expect, it } from 'vitest';
import { actionLabel, actorLabel, detailItems, detailsLine, exclusiveEnd } from './audit-labels';

describe('actionLabel', () => {
  it('names the known actions in plain words', () => {
    expect(actionLabel('team.invite_created')).toBe('Invited a team member');
    expect(actionLabel('refund.marked_paid')).toBe('Marked a refund as paid');
  });

  it('names the refund-access changes', () => {
    expect(actionLabel('team.refund_access_granted')).toBe('Gave someone refund access');
    expect(actionLabel('team.refund_access_removed')).toBe('Removed someone’s refund access');
  });

  it('makes an unknown action readable instead of showing the code', () => {
    expect(actionLabel('widget.frobnicated_twice')).toBe('Widget frobnicated twice');
    expect(actionLabel('')).toBe('Unknown action');
  });
});

describe('actorLabel', () => {
  it('uses the name, then tells a removed account from an unknown visitor', () => {
    expect(actorLabel({ staffName: 'Marie', staffUserId: 's1' })).toBe('Marie');
    expect(actorLabel({ staffName: null, staffUserId: 's1' })).toBe('Removed account');
    expect(actorLabel({ staffName: null, staffUserId: null })).toBe('Unknown visitor');
  });
});

describe('detailsLine', () => {
  it('joins simple values and skips nested ones and blanks', () => {
    expect(detailsLine({ role: 'employee', fields: ['fullName', 'email'], nested: { a: 1 }, blank: '', ok: true })).toBe(
      'role: employee · fields: fullName, email · ok: true',
    );
  });

  it('is empty without metadata', () => {
    expect(detailsLine({})).toBe('');
  });
});

describe('exclusiveEnd', () => {
  it('adds a day, across month and year ends', () => {
    expect(exclusiveEnd('2026-01-31')).toBe('2026-02-01');
    expect(exclusiveEnd('2026-12-31')).toBe('2027-01-01');
  });
});

describe('detailItems', () => {
  it('labels facts in plain words, formats money and Yes or No, and hides ids and facts shown elsewhere', () => {
    expect(
      detailItems({
        actorName: 'Humphreys Hospitality',
        actorRole: 'admin',
        bookingId: '61c35077-c3a2-4bd1-a941-040eb2029db2',
        bookingReference: 'BK-61C35077C3',
        totalCents: 42000,
        refundCents: 0,
        currency: 'EUR',
        paymentMethod: 'pay_at_hotel',
        viaRefundAccess: false,
        noteLength: 17,
        fieldNames: ['fullName', 'email'],
        nested: { a: 1 },
        blank: '',
      }),
    ).toEqual([
      { label: 'Booking', value: 'BK-61C35077C3' },
      { label: 'Total', value: expect.stringContaining('420,00') },
      { label: 'Refund', value: expect.stringContaining('0,00') },
      { label: 'Payment', value: 'Pay at hotel' },
      { label: 'Done with refund access', value: 'No' },
      { label: 'Note length', value: '17 characters' },
      { label: 'Changed', value: 'full name, email' },
    ]);
  });

  it('is empty when there is nothing to show', () => {
    expect(detailItems({ actorName: 'Zoe' })).toEqual([]);
  });
});
