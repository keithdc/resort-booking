// @vitest-environment jsdom
/**
 * @file apps/admin/src/features/reservations/hooks/use-staff-change-dates.test.tsx
 * @feature reservations
 */

import type { RebookQuote, StaffChangeDatesRequest, StaffChangeQuoteRequest, StaffChangeResult } from '@resort-booking/shared-types';
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiRequestError } from '@/shared/services/api-client';
import { rebookQuote, staffReservation } from '@/test/fixtures';
import { useStaffChangeDates } from './use-staff-change-dates';

const api = vi.hoisted(() => ({
  quoteStaffChangeDates: vi.fn<(id: string, body: StaffChangeQuoteRequest) => Promise<RebookQuote>>(),
  changeStaffReservationDates: vi.fn<(id: string, body: StaffChangeDatesRequest) => Promise<StaffChangeResult>>(),
}));

vi.mock('../services/staff-reservations-api', () => api);

const STAY = { id: 'r1', checkIn: '2027-07-10', checkOut: '2027-07-12' };
const RESULT: StaffChangeResult = { reservation: staffReservation({ id: 'r2', reference: 'BK-NEW0000000' }), refund: null };

function setup(open = true): { result: ReturnType<typeof renderHook<ReturnType<typeof useStaffChangeDates>, unknown>>['result']; onChanged: ReturnType<typeof vi.fn> } {
  const onChanged = vi.fn();
  const { result } = renderHook(() => useStaffChangeDates({ stay: STAY, open, onChanged }));
  return { result, onChanged };
}

async function quoted(overrides: Partial<RebookQuote> = {}): Promise<ReturnType<typeof setup>> {
  api.quoteStaffChangeDates.mockResolvedValue(rebookQuote(overrides));
  const rendered = setup();
  act(() => rendered.result.current.setCheckIn('2027-07-20'));
  await act(async () => {
    await rendered.result.current.seePrice();
  });
  return rendered;
}

describe('useStaffChangeDates', () => {
  beforeEach(() => {
    api.quoteStaffChangeDates.mockReset();
    api.changeStaffReservationDates.mockReset();
  });

  afterEach(cleanup);

  it('starts on the booking\'s current dates with nothing to change', () => {
    const { result } = setup();

    expect(result.current.checkIn).toBe('2027-07-10');
    expect(result.current.nights).toBe('2');
    expect(result.current.checkOut).toBe('2027-07-12');
    expect(result.current.unchanged).toBe(true);
    expect(result.current.waiveFee).toBe(false);
  });

  it('works out the new check-out and notices a real change', () => {
    const { result } = setup();

    act(() => {
      result.current.setCheckIn('2027-07-20');
      result.current.setNights('3');
    });

    expect(result.current.checkOut).toBe('2027-07-23');
    expect(result.current.unchanged).toBe(false);
  });

  it('asks the API for the price, passing the waive-fee choice', async () => {
    api.quoteStaffChangeDates.mockResolvedValue(rebookQuote());
    const { result } = setup();
    act(() => {
      result.current.setCheckIn('2027-07-20');
      result.current.setWaiveFee(true);
    });

    await act(async () => {
      await result.current.seePrice();
    });

    expect(api.quoteStaffChangeDates).toHaveBeenCalledWith('r1', { newCheckIn: '2027-07-20', newCheckOut: '2027-07-22', waiveFee: true });
    expect(result.current.quote?.payCents).toBe(30800);
  });

  it('throws the price away as soon as the dates or the fee choice change', async () => {
    const { result } = await quoted();
    expect(result.current.quote).not.toBeNull();

    act(() => result.current.setNights('4'));
    expect(result.current.quote).toBeNull();

    await act(async () => {
      await result.current.seePrice();
    });
    act(() => result.current.setWaiveFee(true));
    expect(result.current.quote).toBeNull();
  });

  it('shows the API message when the price cannot be worked out', async () => {
    api.quoteStaffChangeDates.mockRejectedValue(new ApiRequestError('This booking is already cancelled.', 409));
    const { result } = setup();

    await act(async () => {
      await result.current.seePrice();
    });

    expect(result.current.error).toBe('This booking is already cancelled.');
    expect(result.current.quote).toBeNull();
  });

  it('needs a note, and ticking the outside payment when the guest owes money, before it can confirm', async () => {
    const { result } = await quoted();
    expect(result.current.needsOutsidePayment).toBe(true);
    expect(result.current.canConfirm).toBe(false);

    act(() => result.current.setNote('Guest paid cash at the desk'));
    expect(result.current.canConfirm).toBe(false);

    act(() => result.current.setOutsidePaid(true));
    expect(result.current.canConfirm).toBe(true);
  });

  it('does not ask for an outside payment when nothing is owed, so the note alone is enough', async () => {
    const { result } = await quoted({ newTotalCents: 80000, payCents: 0, refundCents: 14000, balanceCents: -14000 });

    expect(result.current.needsOutsidePayment).toBe(false);
    act(() => result.current.setNote('Guest asked to shorten'));

    expect(result.current.canConfirm).toBe(true);
  });

  it('cannot confirm dates that are not available', async () => {
    const { result } = await quoted({ available: false, problem: 'Those dates are not available for this stay.' });
    act(() => {
      result.current.setNote('Guest asked');
      result.current.setOutsidePaid(true);
    });

    expect(result.current.canConfirm).toBe(false);
  });

  it('changes the dates, sending the note, the waive choice and the outside-payment confirmation', async () => {
    api.changeStaffReservationDates.mockResolvedValue(RESULT);
    const { result, onChanged } = await quoted();
    act(() => {
      result.current.setNote('  Guest paid cash  ');
      result.current.setOutsidePaid(true);
    });

    await act(async () => {
      await result.current.confirm();
    });

    expect(api.changeStaffReservationDates).toHaveBeenCalledWith('r1', {
      newCheckIn: '2027-07-20',
      newCheckOut: '2027-07-22',
      waiveFee: false,
      note: 'Guest paid cash',
      balanceSettledOutside: true,
    });
    expect(onChanged).toHaveBeenCalledWith(RESULT);
  });

  it('never claims an outside payment when the guest owes nothing', async () => {
    api.changeStaffReservationDates.mockResolvedValue(RESULT);
    const { result } = await quoted({ newTotalCents: 80000, payCents: 0, refundCents: 14000, balanceCents: -14000 });
    act(() => result.current.setNote('Guest asked to shorten'));

    await act(async () => {
      await result.current.confirm();
    });

    expect(api.changeStaffReservationDates).toHaveBeenCalledWith('r1', expect.objectContaining({ balanceSettledOutside: false }));
  });

  it('keeps the form and shows the API message when the change is refused', async () => {
    api.changeStaffReservationDates.mockRejectedValue(new ApiRequestError('Those dates are not available for this stay.', 409));
    const { result, onChanged } = await quoted();
    act(() => {
      result.current.setNote('Guest paid cash');
      result.current.setOutsidePaid(true);
    });

    await act(async () => {
      await result.current.confirm();
    });

    expect(result.current.error).toBe('Those dates are not available for this stay.');
    expect(result.current.note).toBe('Guest paid cash');
    expect(result.current.quote).not.toBeNull();
    expect(onChanged).not.toHaveBeenCalled();
  });

  it('will not change twice if confirm is clicked again while the first request runs', async () => {
    let finish: (value: StaffChangeResult) => void = () => undefined;
    api.changeStaffReservationDates.mockImplementationOnce(() => new Promise<StaffChangeResult>((resolve) => { finish = resolve; }));
    const { result, onChanged } = await quoted();
    act(() => {
      result.current.setNote('Guest paid cash');
      result.current.setOutsidePaid(true);
    });

    let first: Promise<void> = Promise.resolve();
    act(() => {
      first = result.current.confirm();
    });
    await act(async () => {
      await result.current.confirm();
    });
    await act(async () => {
      finish(RESULT);
      await first;
    });

    expect(api.changeStaffReservationDates).toHaveBeenCalledTimes(1);
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it('starts fresh each time the dialog is opened again', async () => {
    api.quoteStaffChangeDates.mockResolvedValue(rebookQuote());
    const onChanged = vi.fn();
    const { result, rerender } = renderHook(({ open }: { open: boolean }) => useStaffChangeDates({ stay: STAY, open, onChanged }), {
      initialProps: { open: true },
    });
    act(() => {
      result.current.setCheckIn('2027-07-20');
      result.current.setNote('hello');
    });
    await act(async () => {
      await result.current.seePrice();
    });

    rerender({ open: false });
    rerender({ open: true });

    expect(result.current.checkIn).toBe('2027-07-10');
    expect(result.current.note).toBe('');
    expect(result.current.quote).toBeNull();
  });
});
