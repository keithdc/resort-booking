// @vitest-environment jsdom
/**
 * @file apps/admin/src/features/reservations/hooks/use-staff-cancel.test.tsx
 * @feature reservations
 */

import type { StaffCancelPreview, StaffCancelRequest, StaffCancelResult } from '@resort-booking/shared-types';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiRequestError } from '@/shared/services/api-client';
import { staffRefund, staffReservation } from '@/test/fixtures';
import { useStaffCancel } from './use-staff-cancel';

const api = vi.hoisted(() => ({
  fetchStaffCancelPreview: vi.fn<(id: string) => Promise<StaffCancelPreview>>(),
  cancelStaffReservation: vi.fn<(id: string, body: StaffCancelRequest) => Promise<StaffCancelResult>>(),
}));

vi.mock('../services/staff-reservations-api', () => api);

const PREVIEW: StaffCancelPreview = {
  reservationId: 'r1',
  reference: 'BK-ABC1234567',
  paidCents: 96000,
  currencyCode: 'EUR',
  canCancel: true,
  blockedReason: null,
  policyRefund: { paidCents: 96000, refundPercent: 75, refundCents: 72000, currencyCode: 'EUR', daysBeforeCheckIn: 4 },
};

const RESULT: StaffCancelResult = {
  reservation: staffReservation({ status: 'cancelled' }),
  refund: staffRefund(),
};

function setup(open = true): { result: ReturnType<typeof renderHook<ReturnType<typeof useStaffCancel>, unknown>>['result']; onCancelled: ReturnType<typeof vi.fn> } {
  const onCancelled = vi.fn();
  const { result } = renderHook(() => useStaffCancel({ reservationId: 'r1', open, onCancelled }));
  return { result, onCancelled };
}

async function ready(): Promise<ReturnType<typeof setup>> {
  const rendered = setup(true);
  await waitFor(() => expect(rendered.result.current.preview).not.toBeNull());
  return rendered;
}

describe('useStaffCancel', () => {
  beforeEach(() => {
    api.fetchStaffCancelPreview.mockReset();
    api.cancelStaffReservation.mockReset();
    api.fetchStaffCancelPreview.mockResolvedValue(PREVIEW);
  });

  afterEach(cleanup);

  it('loads the preview when opened and not while closed', async () => {
    setup(false);
    expect(api.fetchStaffCancelPreview).not.toHaveBeenCalled();

    const opened = setup(true);

    await waitFor(() => expect(opened.result.current.preview).not.toBeNull());
    expect(api.fetchStaffCancelPreview).toHaveBeenCalledWith('r1');
  });

  it('shows the API message when the preview cannot be loaded, and offers no confirm', async () => {
    api.fetchStaffCancelPreview.mockRejectedValue(new ApiRequestError('Booking not found', 404));
    const { result } = setup();

    await waitFor(() => expect(result.current.loadError).toBe('Booking not found'));
    expect(result.current.canSubmit).toBe(false);
  });

  it('starts on "guest asked" with the policy refund and an empty note, so it cannot be submitted yet', async () => {
    const { result } = await ready();

    expect(result.current.reason).toBe('guest_request');
    expect(result.current.refundCents).toBe(72000);
    expect(result.current.canSubmit).toBe(false);
  });

  it('can be submitted once a real note is written', async () => {
    const { result } = await ready();

    act(() => result.current.setNote('Guest rang on the 3rd'));

    expect(result.current.canSubmit).toBe(true);
    expect(result.current.noteError).toBeNull();
  });

  it('says the note is too short only after something was typed', async () => {
    const { result } = await ready();
    expect(result.current.noteError).toBeNull();

    act(() => result.current.setNote('ab'));

    expect(result.current.noteError).toContain('at least 3');
    expect(result.current.canSubmit).toBe(false);
  });

  it('refunds everything paid when the property cannot host', async () => {
    const { result } = await ready();

    act(() => result.current.setReason('property_cancelled'));

    expect(result.current.refundCents).toBe(96000);
  });

  it('needs a valid goodwill amount, and refuses more than was paid', async () => {
    const { result } = await ready();
    act(() => {
      result.current.setReason('goodwill');
      result.current.setNote('Pipe burst');
    });
    expect(result.current.canSubmit).toBe(false);

    act(() => result.current.setGoodwillEuros('960,01'));
    expect(result.current.goodwillError).toContain('cannot refund more');
    expect(result.current.canSubmit).toBe(false);

    act(() => result.current.setGoodwillEuros('250'));
    expect(result.current.refundCents).toBe(25000);
    expect(result.current.goodwillError).toBeNull();
    expect(result.current.canSubmit).toBe(true);
  });

  it('cancels with the reason and note, sends null refund unless goodwill, and hands over the result', async () => {
    api.cancelStaffReservation.mockResolvedValue(RESULT);
    const { result, onCancelled } = await ready();
    act(() => result.current.setNote('  Guest rang on the 3rd  '));

    await act(async () => {
      await result.current.confirm();
    });

    expect(api.cancelStaffReservation).toHaveBeenCalledWith('r1', { reason: 'guest_request', refundCents: null, note: 'Guest rang on the 3rd' });
    expect(onCancelled).toHaveBeenCalledWith(RESULT);
  });

  it('sends the exact goodwill amount in cents', async () => {
    api.cancelStaffReservation.mockResolvedValue(RESULT);
    const { result } = await ready();
    act(() => {
      result.current.setReason('goodwill');
      result.current.setGoodwillEuros('49,90');
      result.current.setNote('Apology');
    });

    await act(async () => {
      await result.current.confirm();
    });

    expect(api.cancelStaffReservation).toHaveBeenCalledWith('r1', { reason: 'goodwill', refundCents: 4990, note: 'Apology' });
  });

  it('keeps the form and shows the API message when cancelling fails', async () => {
    api.cancelStaffReservation.mockRejectedValue(new ApiRequestError('This booking is already cancelled.', 409));
    const { result, onCancelled } = await ready();
    act(() => result.current.setNote('Guest rang'));

    await act(async () => {
      await result.current.confirm();
    });

    expect(result.current.error).toBe('This booking is already cancelled.');
    expect(result.current.note).toBe('Guest rang');
    expect(result.current.saving).toBe(false);
    expect(onCancelled).not.toHaveBeenCalled();
  });

  it('will not cancel twice if confirm is clicked again while the first request runs', async () => {
    let finish: (value: StaffCancelResult) => void = () => undefined;
    api.cancelStaffReservation.mockImplementationOnce(() => new Promise<StaffCancelResult>((resolve) => { finish = resolve; }));
    const { result, onCancelled } = await ready();
    act(() => result.current.setNote('Guest rang'));

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

    expect(api.cancelStaffReservation).toHaveBeenCalledTimes(1);
    expect(onCancelled).toHaveBeenCalledTimes(1);
  });

  it('refuses to confirm when the API says the booking cannot be cancelled', async () => {
    api.fetchStaffCancelPreview.mockResolvedValue({ ...PREVIEW, canCancel: false, blockedReason: 'Already cancelled.' });
    const { result } = await ready();
    act(() => result.current.setNote('Guest rang'));

    await act(async () => {
      await result.current.confirm();
    });

    expect(result.current.canSubmit).toBe(false);
    expect(api.cancelStaffReservation).not.toHaveBeenCalled();
  });
});
