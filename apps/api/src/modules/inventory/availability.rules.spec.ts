/**
 * @file apps/api/src/modules/inventory/availability.rules.spec.ts
 * @feature inventory
 * @dependencies availability.rules
 */

import {
  addDaysIso,
  addMonthsIso,
  intersectRangeLists,
  isNightOccupied,
  maxCheckOutDate,
  mergeRanges,
  resolveAvailabilityWindow,
} from './availability.rules';

const WINDOW = { from: '2027-06-01', to: '2027-09-01' };

describe('availability.rules', () => {
  describe('date math', (): void => {
    it('adds days across month ends', (): void => {
      expect(addDaysIso('2027-01-31', 1)).toBe('2027-02-01');
    });

    it('clamps month addition to the last day of a shorter month', (): void => {
      expect(addMonthsIso('2027-01-31', 1)).toBe('2027-02-28');
      expect(addMonthsIso('2028-01-31', 1)).toBe('2028-02-29');
    });
  });

  describe('resolveAvailabilityWindow', (): void => {
    it('defaults to today through 12 months', (): void => {
      expect(resolveAvailabilityWindow(undefined, undefined, '2027-06-10')).toEqual({
        ok: true,
        window: { from: '2027-06-10', to: '2028-06-10' },
      });
    });

    it('raises a past from date to today', (): void => {
      const result = resolveAvailabilityWindow('2027-01-01', '2027-08-01', '2027-06-10');
      expect(result).toEqual({ ok: true, window: { from: '2027-06-10', to: '2027-08-01' } });
    });

    it('rejects inverted and malformed ranges', (): void => {
      expect(resolveAvailabilityWindow('2027-07-01', '2027-06-20', '2027-06-10').ok).toBe(false);
      expect(resolveAvailabilityWindow('2027-02-30', undefined, '2027-01-01').ok).toBe(false);
      expect(resolveAvailabilityWindow('nope', undefined, '2027-01-01').ok).toBe(false);
    });

    it('rejects windows over 24 months', (): void => {
      const result = resolveAvailabilityWindow('2027-06-10', '2029-06-11', '2027-06-10');
      expect(result).toMatchObject({ ok: false, code: 'WINDOW_TOO_LARGE' });
      expect(resolveAvailabilityWindow('2027-06-10', '2029-06-10', '2027-06-10').ok).toBe(true);
    });
  });

  describe('mergeRanges', (): void => {
    it('merges back-to-back stays into one range', (): void => {
      expect(
        mergeRanges(
          [
            { startDate: '2027-06-10', endDate: '2027-06-14' },
            { startDate: '2027-06-14', endDate: '2027-06-18' },
          ],
          WINDOW,
        ),
      ).toEqual([{ startDate: '2027-06-10', endDate: '2027-06-18' }]);
    });

    it('keeps ranges separate when a free night sits between them', (): void => {
      expect(
        mergeRanges(
          [
            { startDate: '2027-06-15', endDate: '2027-06-18' },
            { startDate: '2027-06-10', endDate: '2027-06-14' },
          ],
          WINDOW,
        ),
      ).toEqual([
        { startDate: '2027-06-10', endDate: '2027-06-14' },
        { startDate: '2027-06-15', endDate: '2027-06-18' },
      ]);
    });

    it('clips stays that cross the window edges and drops ones outside it', (): void => {
      expect(
        mergeRanges(
          [
            { startDate: '2027-05-28', endDate: '2027-06-03' },
            { startDate: '2027-08-30', endDate: '2027-09-05' },
            { startDate: '2027-04-01', endDate: '2027-04-05' },
          ],
          WINDOW,
        ),
      ).toEqual([
        { startDate: '2027-06-01', endDate: '2027-06-03' },
        { startDate: '2027-08-30', endDate: '2027-09-01' },
      ]);
    });

    it('does not mutate its input', (): void => {
      const input = [{ startDate: '2027-06-10', endDate: '2027-06-12' }];
      mergeRanges(input, WINDOW);
      expect(input).toEqual([{ startDate: '2027-06-10', endDate: '2027-06-12' }]);
    });
  });

  describe('intersectRangeLists', (): void => {
    it('returns nights occupied in every house', (): void => {
      expect(
        intersectRangeLists([
          [{ startDate: '2027-06-10', endDate: '2027-06-20' }],
          [{ startDate: '2027-06-15', endDate: '2027-06-25' }],
        ]),
      ).toEqual([{ startDate: '2027-06-15', endDate: '2027-06-20' }]);
    });

    it('returns nothing when any house is free the whole time', (): void => {
      expect(
        intersectRangeLists([[{ startDate: '2027-06-10', endDate: '2027-06-20' }], []]),
      ).toEqual([]);
    });

    it('returns nothing when there are no houses', (): void => {
      expect(intersectRangeLists([])).toEqual([]);
    });

    it('works for a single house', (): void => {
      expect(intersectRangeLists([[{ startDate: '2027-06-10', endDate: '2027-06-12' }]])).toEqual([
        { startDate: '2027-06-10', endDate: '2027-06-12' },
      ]);
    });
  });

  describe('check-in and check-out limits', (): void => {
    const ranges = [{ startDate: '2027-06-10', endDate: '2027-06-14' }];

    it('treats the check-out day as free for the next check-in', (): void => {
      expect(isNightOccupied(ranges, '2027-06-14')).toBe(false);
      expect(isNightOccupied(ranges, '2027-06-13')).toBe(true);
      expect(isNightOccupied(ranges, '2027-06-10')).toBe(true);
      expect(isNightOccupied(ranges, '2027-06-09')).toBe(false);
    });

    it('limits check-out to the day the next stay starts', (): void => {
      expect(maxCheckOutDate(ranges, '2027-06-05', WINDOW.to)).toBe('2027-06-10');
    });

    it('falls back to the window end when nothing follows', (): void => {
      expect(maxCheckOutDate(ranges, '2027-06-14', WINDOW.to)).toBe('2027-09-01');
    });
  });
});
