// @vitest-environment jsdom
/**
 * @file apps/admin/src/features/refunds/hooks/use-refunds.test.tsx
 * @feature refunds
 */

import type { MarkRefundPaidRequest, StaffRefund } from '@resort-booking/shared-types';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiRequestError } from '@/shared/services/api-client';
import { staffRefund } from '@/test/fixtures';
import type { RefundListStatus } from '../services/staff-refunds-api';
import { useRefunds } from './use-refunds';

const api = vi.hoisted(() => ({
  fetchStaffRefunds: vi.fn<(status: RefundListStatus, propertyId: string) => Promise<StaffRefund[]>>(),
  retryStaffRefund: vi.fn<(id: string) => Promise<StaffRefund>>(),
  markStaffRefundPaid: vi.fn<(id: string, body: MarkRefundPaidRequest) => Promise<StaffRefund>>(),
}));

vi.mock('../services/staff-refunds-api', () => api);

const PENDING = staffRefund({ id: 'a', status: 'pending', provider: 'manual', reference: 'BK-AAA0000000' });
const FAILED = staffRefund({ id: 'b', status: 'failed', provider: 'mock', reference: 'BK-BBB0000000', failureReason: 'card_closed' });

async function ready(initial: StaffRefund[] = [PENDING, FAILED]): Promise<ReturnType<typeof renderHook<ReturnType<typeof useRefunds>, unknown>>['result']> {
  api.fetchStaffRefunds.mockResolvedValue(initial);
  const { result } = renderHook(() => useRefunds());
  await waitFor(() => expect(result.current.loading).toBe(false));
  return result;
}

describe('useRefunds', () => {
  beforeEach(() => {
    Object.values(api).forEach((mock) => mock.mockReset());
  });

  afterEach(cleanup);

  it('loads what needs attention across all properties first', async () => {
    const result = await ready();

    expect(api.fetchStaffRefunds).toHaveBeenCalledWith('needs_attention', '');
    expect(result.current.filter).toBe('attention');
    expect(result.current.visible.map((refund) => refund.id)).toEqual(['a', 'b']);
    expect(result.current.total).toBe(2);
  });

  it('reloads with the right status when the chip changes', async () => {
    const result = await ready();

    act(() => result.current.setFilter('done'));

    await waitFor(() => expect(api.fetchStaffRefunds).toHaveBeenLastCalledWith('succeeded', ''));
  });

  it('reloads for one property when the property changes', async () => {
    const result = await ready();

    act(() => result.current.setPropertyId('p1'));

    await waitFor(() => expect(api.fetchStaffRefunds).toHaveBeenLastCalledWith('needs_attention', 'p1'));
  });

  it('narrows the list by the search without asking the API again', async () => {
    const result = await ready();
    const calls = api.fetchStaffRefunds.mock.calls.length;

    act(() => result.current.setQuery('bbb'));

    expect(result.current.visible.map((refund) => refund.id)).toEqual(['b']);
    expect(result.current.total).toBe(2);
    expect(api.fetchStaffRefunds.mock.calls).toHaveLength(calls);
  });

  it('shows the API message and an empty list when loading fails', async () => {
    api.fetchStaffRefunds.mockRejectedValue(new ApiRequestError('Staff authentication required', 401));
    const { result } = renderHook(() => useRefunds());

    await waitFor(() => expect(result.current.error).toBe('Staff authentication required'));
    expect(result.current.visible).toEqual([]);
    expect(result.current.loading).toBe(false);
  });

  describe('retrying', () => {
    it('updates the row and says so', async () => {
      const result = await ready();
      api.retryStaffRefund.mockResolvedValue({ ...FAILED, status: 'pending' });

      let ok = false;
      await act(async () => {
        ok = await result.current.retry('b');
      });

      expect(ok).toBe(true);
      expect(api.retryStaffRefund).toHaveBeenCalledWith('b');
      expect(result.current.visible.find((refund) => refund.id === 'b')?.status).toBe('pending');
      expect(result.current.notice).toBe('Refund sent again');
    });

    it('drops the row from the "needs attention" list once the refund is done', async () => {
      const result = await ready();
      api.retryStaffRefund.mockResolvedValue({ ...FAILED, status: 'succeeded' });

      await act(async () => {
        await result.current.retry('b');
      });

      expect(result.current.visible.map((refund) => refund.id)).toEqual(['a']);
    });

    it('keeps the row and shows the API message when the retry fails', async () => {
      const result = await ready();
      api.retryStaffRefund.mockRejectedValue(new ApiRequestError('This refund cannot be retried.', 409));

      let ok = true;
      await act(async () => {
        ok = await result.current.retry('b');
      });

      expect(ok).toBe(false);
      expect(result.current.actionError).toBe('This refund cannot be retried.');
      expect(result.current.visible).toHaveLength(2);
      expect(result.current.notice).toBeNull();
    });

    it('ignores a second click while the first is still running', async () => {
      const result = await ready();
      let finish: (value: StaffRefund) => void = () => undefined;
      api.retryStaffRefund.mockImplementationOnce(() => new Promise<StaffRefund>((resolve) => { finish = resolve; }));

      let first: Promise<boolean> = Promise.resolve(false);
      act(() => {
        first = result.current.retry('b');
      });
      expect(result.current.busyId).toBe('b');
      let second = true;
      await act(async () => {
        second = await result.current.retry('b');
      });
      await act(async () => {
        finish({ ...FAILED, status: 'pending' });
        await first;
      });

      expect(second).toBe(false);
      expect(api.retryStaffRefund).toHaveBeenCalledTimes(1);
      expect(result.current.busyId).toBeNull();
    });
  });

  describe('marking as sent by hand', () => {
    it('sends the trimmed note, updates the list and says so', async () => {
      const result = await ready();
      api.markStaffRefundPaid.mockResolvedValue({ ...PENDING, status: 'succeeded', resolvedByName: 'Marie', resolutionNote: 'Bank transfer 3 June' });

      let ok = false;
      await act(async () => {
        ok = await result.current.markPaid('a', '  Bank transfer 3 June  ');
      });

      expect(ok).toBe(true);
      expect(api.markStaffRefundPaid).toHaveBeenCalledWith('a', { note: 'Bank transfer 3 June' });
      expect(result.current.visible.map((refund) => refund.id)).toEqual(['b']);
      expect(result.current.notice).toBe('Refund marked as sent');
    });

    it('keeps the row and shows the API message when it is refused', async () => {
      const result = await ready();
      api.markStaffRefundPaid.mockRejectedValue(new ApiRequestError('This refund is already settled.', 409));

      await act(async () => {
        await result.current.markPaid('a', 'Bank transfer');
      });

      expect(result.current.actionError).toBe('This refund is already settled.');
      expect(result.current.visible).toHaveLength(2);
    });

    it('keeps a resolved refund in the list when the chip is "All"', async () => {
      api.fetchStaffRefunds.mockResolvedValue([PENDING]);
      const { result } = renderHook(() => useRefunds('all'));
      await waitFor(() => expect(result.current.loading).toBe(false));
      api.markStaffRefundPaid.mockResolvedValue({ ...PENDING, status: 'succeeded' });

      await act(async () => {
        await result.current.markPaid('a', 'Bank transfer');
      });

      expect(result.current.visible.map((refund) => [refund.id, refund.status])).toEqual([['a', 'succeeded']]);
    });
  });

  it('clears the action error and the notice on request', async () => {
    const result = await ready();
    api.retryStaffRefund.mockRejectedValue(new ApiRequestError('Nope', 409));
    await act(async () => {
      await result.current.retry('b');
    });

    act(() => result.current.clearActionError());
    expect(result.current.actionError).toBeNull();

    api.retryStaffRefund.mockResolvedValue({ ...FAILED, status: 'pending' });
    await act(async () => {
      await result.current.retry('b');
    });
    act(() => result.current.clearNotice());
    expect(result.current.notice).toBeNull();
  });
});
