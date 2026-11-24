/**
 * @file apps/web/src/features/houses/utils/hold-countdown.test.ts
 * @feature houses
 */

import { describe, expect, it } from 'vitest';
import {
  formatClock,
  formatHoldDuration,
  holdProgressPercent,
  isWarningReached,
  remainingSecondsUntil,
  secondsBetween,
} from './hold-countdown';

describe('formatHoldDuration', () => {
  it('says minutes for a card hold and hours for a bank-transfer hold, from the API\'s seconds', () => {
    expect(formatHoldDuration(900)).toBe('15 minutes');
    expect(formatHoldDuration(172800)).toBe('48 hours');
  });

  it('uses the singular for exactly one', () => {
    expect(formatHoldDuration(60)).toBe('1 minute');
    expect(formatHoldDuration(3600)).toBe('1 hour');
  });

  it('never says less than a minute, and rounds sensibly', () => {
    expect(formatHoldDuration(20)).toBe('1 minute');
    expect(formatHoldDuration(90)).toBe('2 minutes');
    expect(formatHoldDuration(5400)).toBe('2 hours');
  });

  it('follows a changed hold length without any code change', () => {
    expect(formatHoldDuration(1800)).toBe('30 minutes');
    expect(formatHoldDuration(86400)).toBe('24 hours');
  });

  it('shows zero minutes for nothing, negative or unreadable lengths', () => {
    expect(formatHoldDuration(0)).toBe('0 minutes');
    expect(formatHoldDuration(-5)).toBe('0 minutes');
    expect(formatHoldDuration(Number.NaN)).toBe('0 minutes');
  });
});

describe('formatClock', () => {
  it('shows mm:ss under an hour', () => {
    expect(formatClock(899)).toBe('14:59');
    expect(formatClock(300)).toBe('05:00');
    expect(formatClock(9)).toBe('00:09');
  });

  it('shows h:mm:ss from an hour up', () => {
    expect(formatClock(172799)).toBe('47:59:59');
    expect(formatClock(3600)).toBe('1:00:00');
  });

  it('shows 00:00 for zero, negative or unreadable input and drops fractions', () => {
    expect(formatClock(0)).toBe('00:00');
    expect(formatClock(-10)).toBe('00:00');
    expect(formatClock(Number.NaN)).toBe('00:00');
    expect(formatClock(59.9)).toBe('00:59');
  });
});

describe('remainingSecondsUntil', () => {
  const now = Date.parse('2027-05-01T12:00:00Z');

  it('counts whole seconds left', () => {
    expect(remainingSecondsUntil('2027-05-01T12:15:00Z', now)).toBe(900);
    expect(remainingSecondsUntil('2027-05-01T12:00:00.900Z', now)).toBe(0);
  });

  it('never goes below zero once expired, and treats an unreadable date as expired', () => {
    expect(remainingSecondsUntil('2027-05-01T11:00:00Z', now)).toBe(0);
    expect(remainingSecondsUntil('nope', now)).toBe(0);
  });
});

describe('secondsBetween and isWarningReached', () => {
  it('measures the warning window between the API\'s two times', () => {
    expect(secondsBetween('2027-05-01T12:10:00Z', '2027-05-01T12:15:00Z')).toBe(300);
  });

  it('is zero for a reversed or unreadable pair', () => {
    expect(secondsBetween('2027-05-01T12:15:00Z', '2027-05-01T12:10:00Z')).toBe(0);
    expect(secondsBetween('x', '2027-05-01T12:15:00Z')).toBe(0);
  });

  it('flips to true exactly at the warning moment', () => {
    const warningAt = '2027-05-01T12:10:00Z';
    expect(isWarningReached(warningAt, Date.parse('2027-05-01T12:09:59Z'))).toBe(false);
    expect(isWarningReached(warningAt, Date.parse('2027-05-01T12:10:00Z'))).toBe(true);
    expect(isWarningReached('nope', Date.now())).toBe(false);
  });
});

describe('holdProgressPercent', () => {
  it('is time left out of the whole hold', () => {
    expect(holdProgressPercent(450, 900)).toBe(50);
    expect(holdProgressPercent(900, 900)).toBe(100);
    expect(holdProgressPercent(0, 900)).toBe(0);
  });

  it('stays within 0 to 100 and survives bad input', () => {
    expect(holdProgressPercent(2000, 900)).toBe(100);
    expect(holdProgressPercent(-5, 900)).toBe(0);
    expect(holdProgressPercent(10, 0)).toBe(0);
    expect(holdProgressPercent(Number.NaN, 900)).toBe(0);
  });
});
