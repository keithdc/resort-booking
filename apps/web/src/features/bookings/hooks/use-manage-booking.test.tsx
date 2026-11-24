// @vitest-environment jsdom
/**
 * @file apps/web/src/features/bookings/hooks/use-manage-booking.test.tsx
 * @feature bookings
 */

import type { GuestBooking, GuestBookingLookupRequest } from '@resort-booking/shared-types';
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiRequestError } from '@/shared/services/api-client';
import { useManageBooking } from './use-manage-booking';

const api = vi.hoisted(() => ({
  lookupBooking: vi.fn<(request: GuestBookingLookupRequest) => Promise<GuestBooking>>(),
  cancelBooking: vi.fn<(request: GuestBookingLookupRequest) => Promise<GuestBooking>>(),
}));

vi.mock('../services/bookings-api', () => api);

function booking(overrides: Partial<GuestBooking> = {}): GuestBooking {
  return {
    reference: 'BK-ABC1234567',
    reservationId: 'r1',
    stayName: 'Lake Chalet',
    propertyName: 'Alpine Lake',
    checkIn: '2027-07-10',
    checkOut: '2027-07-12',
    guestCount: 2,
    bookerName: 'Ada',
    totalCents: 96000,
    currencyCode: 'EUR',
    status: 'confirmed',
    canCancel: true,
    cancelBlockedReason: null,
    refundQuote: { paidCents: 96000, refundPercent: 75, refundCents: 72000, currencyCode: 'EUR', daysBeforeCheckIn: 4 },
    refund: null,
    rebookable: false,
    canChangeDates: false,
    changeDatesBlockedReason: 'The dates of this booking cannot be changed. To change them, cancel and book again.',
    replacedByReference: null,
    ...overrides,
  };
}

const CANCELLED = booking({
  status: 'cancelled',
  canCancel: false,
  refundQuote: null,
  refund: { amountCents: 72000, percent: 75, currencyCode: 'EUR', status: 'succeeded', simulated: true },
});

describe('useManageBooking', () => {
  beforeEach(() => {
    api.lookupBooking.mockReset();
    api.cancelBooking.mockReset();
  });

  afterEach(cleanup);

  it('finds a booking with the trimmed reference and email', async () => {
    api.lookupBooking.mockResolvedValue(booking());
    const { result } = renderHook(() => useManageBooking());

    await act(async () => {
      await result.current.find('  BK-ABC1234567 ', ' ada@example.com ');
    });

    expect(api.lookupBooking).toHaveBeenCalledWith({ reference: 'BK-ABC1234567', email: 'ada@example.com' });
    expect(result.current.booking?.stayName).toBe('Lake Chalet');
    expect(result.current.error).toBeNull();
  });

  it('shows the API message when nothing matches and keeps no booking', async () => {
    api.lookupBooking.mockRejectedValue(new ApiRequestError('We could not find that booking.', 404, 'BOOKING_NOT_FOUND'));
    const { result } = renderHook(() => useManageBooking());

    await act(async () => {
      await result.current.find('BK-X', 'ada@example.com');
    });

    expect(result.current.booking).toBeNull();
    expect(result.current.error).toBe('We could not find that booking.');
  });

  it('shows the too-many-attempts message from the API', async () => {
    api.lookupBooking.mockRejectedValue(new ApiRequestError('Too many attempts. Please wait a minute.', 429, 'LOOKUP_RATE_LIMITED'));
    const { result } = renderHook(() => useManageBooking());

    await act(async () => {
      await result.current.find('BK-X', 'ada@example.com');
    });

    expect(result.current.error).toBe('Too many attempts. Please wait a minute.');
  });

  it('falls back to a plain message for an unexpected failure', async () => {
    api.lookupBooking.mockRejectedValue(new Error('offline'));
    const { result } = renderHook(() => useManageBooking());

    await act(async () => {
      await result.current.find('BK-X', 'ada@example.com');
    });

    expect(result.current.error).toBe('Could not look up your booking. Please try again.');
  });

  it('cancels with the same reference and email that found the booking', async () => {
    api.lookupBooking.mockResolvedValue(booking());
    api.cancelBooking.mockResolvedValue(CANCELLED);
    const { result } = renderHook(() => useManageBooking());
    await act(async () => {
      await result.current.find('BK-ABC1234567', 'ada@example.com');
    });

    await act(async () => {
      await result.current.cancel();
    });

    expect(api.cancelBooking).toHaveBeenCalledWith({ reference: 'BK-ABC1234567', email: 'ada@example.com' });
    expect(result.current.booking?.status).toBe('cancelled');
    expect(result.current.booking?.refund?.amountCents).toBe(72000);
    expect(result.current.justCancelled).toBe(true);
  });

  it('keeps the booking and shows the message when cancelling fails', async () => {
    api.lookupBooking.mockResolvedValue(booking());
    api.cancelBooking.mockRejectedValue(new ApiRequestError('This booking has already started.', 409, 'CANCELLATION_NOT_ALLOWED'));
    const { result } = renderHook(() => useManageBooking());
    await act(async () => {
      await result.current.find('BK-ABC1234567', 'ada@example.com');
    });

    await act(async () => {
      await result.current.cancel();
    });

    expect(result.current.booking?.status).toBe('confirmed');
    expect(result.current.error).toBe('This booking has already started.');
    expect(result.current.justCancelled).toBe(false);
  });

  it('does nothing when asked to cancel before any booking was found', async () => {
    const { result } = renderHook(() => useManageBooking());

    await act(async () => {
      await result.current.cancel();
    });

    expect(api.cancelBooking).not.toHaveBeenCalled();
  });

  it('ignores a second cancel tap while the first is still running', async () => {
    api.lookupBooking.mockResolvedValue(booking());
    let finish: (value: GuestBooking) => void = () => undefined;
    api.cancelBooking.mockImplementationOnce(() => new Promise<GuestBooking>((resolve) => { finish = resolve; }));
    const { result } = renderHook(() => useManageBooking());
    await act(async () => {
      await result.current.find('BK-ABC1234567', 'ada@example.com');
    });

    let first: Promise<void> = Promise.resolve();
    act(() => {
      first = result.current.cancel();
    });
    await act(async () => {
      await result.current.cancel();
    });
    await act(async () => {
      finish(CANCELLED);
      await first;
    });

    expect(api.cancelBooking).toHaveBeenCalledTimes(1);
    expect(result.current.booking?.status).toBe('cancelled');
  });

  it('forgets the booking and the email when reset', async () => {
    api.lookupBooking.mockResolvedValue(booking());
    const { result } = renderHook(() => useManageBooking());
    await act(async () => {
      await result.current.find('BK-ABC1234567', 'ada@example.com');
    });

    act(() => result.current.reset());
    await act(async () => {
      await result.current.cancel();
    });

    expect(result.current.booking).toBeNull();
    expect(api.cancelBooking).not.toHaveBeenCalled();
  });

  describe('credentials and adopting a replacement booking', () => {
    it('knows who is signed in once a booking is found, and nobody before', async () => {
      api.lookupBooking.mockResolvedValue(booking());
      const { result } = renderHook(() => useManageBooking());
      expect(result.current.credentials).toBeNull();

      await act(async () => {
        await result.current.find('BK-ABC1234567', 'ada@example.com');
      });

      expect(result.current.credentials).toEqual({ reference: 'BK-ABC1234567', email: 'ada@example.com' });
    });

    it('switches to the new booking after a date change and keeps the same email', async () => {
      api.lookupBooking.mockResolvedValue(booking());
      const { result } = renderHook(() => useManageBooking());
      await act(async () => {
        await result.current.find('BK-ABC1234567', 'ada@example.com');
      });

      act(() => result.current.adopt(booking({ reference: 'BK-NEW0000000', checkIn: '2027-07-20', checkOut: '2027-07-22' })));

      expect(result.current.booking?.reference).toBe('BK-NEW0000000');
      expect(result.current.credentials).toEqual({ reference: 'BK-NEW0000000', email: 'ada@example.com' });
    });

    it('cancels the NEW booking, not the old one, after adopting it', async () => {
      api.lookupBooking.mockResolvedValue(booking());
      api.cancelBooking.mockResolvedValue(CANCELLED);
      const { result } = renderHook(() => useManageBooking());
      await act(async () => {
        await result.current.find('BK-ABC1234567', 'ada@example.com');
      });
      act(() => result.current.adopt(booking({ reference: 'BK-NEW0000000' })));

      await act(async () => {
        await result.current.cancel();
      });

      expect(api.cancelBooking).toHaveBeenCalledWith({ reference: 'BK-NEW0000000', email: 'ada@example.com' });
    });

    it('clears an earlier error when it adopts the new booking', async () => {
      api.lookupBooking.mockResolvedValue(booking());
      api.cancelBooking.mockRejectedValue(new ApiRequestError('Nope', 409, 'CANCELLATION_NOT_ALLOWED'));
      const { result } = renderHook(() => useManageBooking());
      await act(async () => {
        await result.current.find('BK-ABC1234567', 'ada@example.com');
      });
      await act(async () => {
        await result.current.cancel();
      });
      expect(result.current.error).toBe('Nope');

      act(() => result.current.adopt(booking({ reference: 'BK-NEW0000000' })));

      expect(result.current.error).toBeNull();
    });

    it('does nothing when asked to adopt before anyone is signed in', () => {
      const { result } = renderHook(() => useManageBooking());

      act(() => result.current.adopt(booking({ reference: 'BK-NEW0000000' })));

      expect(result.current.booking).toBeNull();
    });

    it('forgets the credentials on reset', async () => {
      api.lookupBooking.mockResolvedValue(booking());
      const { result } = renderHook(() => useManageBooking());
      await act(async () => {
        await result.current.find('BK-ABC1234567', 'ada@example.com');
      });

      act(() => result.current.reset());

      expect(result.current.credentials).toBeNull();
    });
  });
});
