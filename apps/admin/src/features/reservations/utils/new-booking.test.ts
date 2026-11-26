/**
 * @file apps/admin/src/features/reservations/utils/new-booking.test.ts
 * @feature reservations
 */

import { describe, expect, it } from 'vitest';
import { NEW_BOOKING_PAYMENT_OPTIONS, stayFromDraft, stayProblem, wholeNumberInRange } from './new-booking';

const HOUSE = { id: 'h1', capacity: 4, name: 'Lake Chalet' };
const DRAFT = { houseId: 'h1', checkIn: '2027-07-10', nights: '3', guests: '2' };
const TODAY = '2027-07-01';

describe('wholeNumberInRange', () => {
  it('accepts whole numbers in range and refuses everything else', () => {
    expect(wholeNumberInRange('3', 1, 4)).toBe(3);
    expect(wholeNumberInRange(' 4 ', 1, 4)).toBe(4);
    for (const bad of ['0', '5', '', '1.5', '-1', '1e1', 'two', '1234']) {
      expect(wholeNumberInRange(bad, 1, 4)).toBeNull();
    }
  });
});

describe('stayFromDraft', () => {
  it('works out the check-out and a numeric party', () => {
    expect(stayFromDraft(DRAFT, HOUSE, TODAY)).toEqual({ houseId: 'h1', checkIn: '2027-07-10', checkOut: '2027-07-13', guestCount: 2 });
  });

  it('allows check-in today and refuses the past, a missing stay and too many guests or nights', () => {
    expect(stayFromDraft({ ...DRAFT, checkIn: TODAY }, HOUSE, TODAY)).not.toBeNull();
    expect(stayFromDraft({ ...DRAFT, checkIn: '2027-06-30' }, HOUSE, TODAY)).toBeNull();
    expect(stayFromDraft(DRAFT, null, TODAY)).toBeNull();
    expect(stayFromDraft({ ...DRAFT, houseId: 'other' }, HOUSE, TODAY)).toBeNull();
    expect(stayFromDraft({ ...DRAFT, guests: '5' }, HOUSE, TODAY)).toBeNull();
    expect(stayFromDraft({ ...DRAFT, nights: '61' }, HOUSE, TODAY)).toBeNull();
    expect(stayFromDraft({ ...DRAFT, checkIn: '' }, HOUSE, TODAY)).toBeNull();
  });
});

describe('stayProblem', () => {
  it('says what is missing, in order', () => {
    expect(stayProblem(DRAFT, null, TODAY)).toBe('Choose a property and a stay.');
    expect(stayProblem({ ...DRAFT, checkIn: '' }, HOUSE, TODAY)).toBe('Choose the check-in date.');
    expect(stayProblem({ ...DRAFT, checkIn: '2027-06-01' }, HOUSE, TODAY)).toBe('Check-in cannot be in the past.');
    expect(stayProblem({ ...DRAFT, nights: '0' }, HOUSE, TODAY)).toContain('Nights must be');
    expect(stayProblem({ ...DRAFT, guests: '9' }, HOUSE, TODAY)).toContain('sleeps up to 4');
    expect(stayProblem(DRAFT, HOUSE, TODAY)).toBeNull();
  });
});

describe('payment options', () => {
  it('opens only pay at hotel; the credit card option says it is coming soon', () => {
    expect(NEW_BOOKING_PAYMENT_OPTIONS.filter((option) => option.enabled).map((option) => option.value)).toEqual(['pay_at_hotel']);
    expect(NEW_BOOKING_PAYMENT_OPTIONS.find((option) => option.value === 'card_link')).toMatchObject({ label: 'Credit card', help: 'Payment link: coming soon' });
  });
});
