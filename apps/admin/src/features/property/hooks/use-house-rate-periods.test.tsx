// @vitest-environment jsdom
/**
 * @file apps/admin/src/features/property/hooks/use-house-rate-periods.test.tsx
 * @feature property
 */

import type {
  BulkRatePeriodPreview,
  BulkRatePeriodRequest,
  BulkRatePeriodResult,
  RatePeriod,
  RatePeriodWrite,
} from '@resort-booking/shared-types';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiRequestError } from '@/shared/services/api-client';
import { useHouseRatePeriods } from './use-house-rate-periods';

const api = vi.hoisted(() => ({
  fetchRatePeriods: vi.fn<(houseId: string) => Promise<RatePeriod[]>>(),
  createRatePeriod: vi.fn<(houseId: string, body: RatePeriodWrite) => Promise<RatePeriod>>(),
  updateRatePeriod: vi.fn<(periodId: string, body: RatePeriodWrite) => Promise<RatePeriod>>(),
  deleteRatePeriod: vi.fn<(periodId: string) => Promise<null>>(),
  previewBulkRatePeriod: vi.fn<(propertyId: string, body: BulkRatePeriodRequest) => Promise<BulkRatePeriodPreview>>(),
  applyBulkRatePeriod: vi.fn<(propertyId: string, body: BulkRatePeriodRequest) => Promise<BulkRatePeriodResult>>(),
}));

vi.mock('../services/staff-rates-api', () => api);

const HOUSES = ['h1', 'h2', 'h3'];

function period(id: string, label = 'Peak summer'): RatePeriod {
  return { id, houseId: 'h1', propertyId: 'p1', label, startDate: '2027-07-01', endDate: '2027-08-31', nightlyRateCents: 26000 };
}

function setup(open = true): ReturnType<typeof renderHook<ReturnType<typeof useHouseRatePeriods>, { open: boolean }>> {
  return renderHook(
    ({ open: isOpen }: { open: boolean }) =>
      useHouseRatePeriods({ houseId: 'h1', propertyId: 'p1', allHouseIds: HOUSES, open: isOpen }),
    { initialProps: { open } },
  );
}

async function fillDraft(result: ReturnType<typeof setup>['result'], patch: Partial<Parameters<ReturnType<typeof setup>['result']['current']['updateDraft']>[0]> = {}): Promise<void> {
  act((): void => {
    result.current.updateDraft({ label: 'Peak summer', startDate: '2027-07-01', endDate: '2027-08-31', euros: '260', ...patch });
  });
}

describe('useHouseRatePeriods', () => {
  beforeEach(() => {
    Object.values(api).forEach((mock) => mock.mockReset());
    api.fetchRatePeriods.mockResolvedValue([]);
  });

  afterEach(cleanup);

  it('loads the periods when opened and not while closed', async () => {
    api.fetchRatePeriods.mockResolvedValue([period('a')]);
    const closed = setup(false);
    expect(api.fetchRatePeriods).not.toHaveBeenCalled();
    closed.unmount();

    const opened = setup(true);

    await waitFor(() => expect(opened.result.current.periods).toHaveLength(1));
    expect(api.fetchRatePeriods).toHaveBeenCalledWith('h1');
  });

  it('shows a readable error when loading fails', async () => {
    api.fetchRatePeriods.mockRejectedValue(new ApiRequestError('boom', 500));

    const { result } = setup();

    await waitFor(() => expect(result.current.error).toBe('boom'));
  });

  it('creates a period, converting euros to cents, then reloads and clears the form', async () => {
    api.createRatePeriod.mockResolvedValue(period('new'));
    const { result } = setup();
    await waitFor(() => expect(api.fetchRatePeriods).toHaveBeenCalledTimes(1));
    await fillDraft(result, { euros: '260,50' });

    await act(async () => {
      await result.current.save();
    });

    expect(api.createRatePeriod).toHaveBeenCalledWith('h1', {
      label: 'Peak summer',
      startDate: '2027-07-01',
      endDate: '2027-08-31',
      nightlyRateCents: 26050,
    });
    expect(api.fetchRatePeriods).toHaveBeenCalledTimes(2);
    expect(result.current.notice).toBe('Seasonal rate added');
    expect(result.current.draft.label).toBe('');
  });

  it('shows the overlap message and keeps the form filled', async () => {
    api.createRatePeriod.mockRejectedValue(new ApiRequestError('These dates overlap "Peak summer"', 409));
    const { result } = setup();
    await waitFor(() => expect(api.fetchRatePeriods).toHaveBeenCalled());
    await fillDraft(result);

    await act(async () => {
      await result.current.save();
    });

    expect(result.current.error).toContain('overlap "Peak summer"');
    expect(result.current.draft.label).toBe('Peak summer');
    expect(result.current.saving).toBe(false);
  });

  it('edits an existing period', async () => {
    api.updateRatePeriod.mockResolvedValue(period('a'));
    const { result } = setup();
    await waitFor(() => expect(api.fetchRatePeriods).toHaveBeenCalled());

    act(() => result.current.startEdit(period('a')));
    expect(result.current.draft).toMatchObject({ id: 'a', euros: '260', applyToAll: false });
    await act(async () => {
      await result.current.save();
    });

    expect(api.updateRatePeriod).toHaveBeenCalledWith('a', expect.objectContaining({ nightlyRateCents: 26000 }));
    expect(api.createRatePeriod).not.toHaveBeenCalled();
    expect(result.current.notice).toBe('Seasonal rate updated');
  });

  it('removes a period and reloads', async () => {
    api.deleteRatePeriod.mockResolvedValue(null);
    const { result } = setup();
    await waitFor(() => expect(api.fetchRatePeriods).toHaveBeenCalled());

    await act(async () => {
      await result.current.remove('a');
    });

    expect(api.deleteRatePeriod).toHaveBeenCalledWith('a');
    expect(result.current.notice).toBe('Seasonal rate removed');
  });

  describe('apply to all houses', () => {
    const preview: BulkRatePeriodPreview = {
      propertyId: 'p1',
      addCount: 2,
      conflictCount: 1,
      results: [
        { houseId: 'h1', houseName: 'Dune', status: 'will_add', conflict: null },
        { houseId: 'h2', houseName: 'Cedar', status: 'will_add', conflict: null },
        { houseId: 'h3', houseName: 'Lake', status: 'conflict', conflict: { label: 'Peak', startDate: '2027-07-01', endDate: '2027-07-31' } },
      ],
    };

    it('previews first and writes nothing until the warning is confirmed', async () => {
      api.previewBulkRatePeriod.mockResolvedValue(preview);
      const { result } = setup();
      await waitFor(() => expect(api.fetchRatePeriods).toHaveBeenCalled());
      await fillDraft(result, { applyToAll: true });

      await act(async () => {
        await result.current.save();
      });

      expect(api.previewBulkRatePeriod).toHaveBeenCalledWith('p1', expect.objectContaining({ houseIds: HOUSES, confirmed: false }));
      expect(result.current.bulkWarning?.preview.conflictCount).toBe(1);
      expect(api.applyBulkRatePeriod).not.toHaveBeenCalled();
      expect(api.createRatePeriod).not.toHaveBeenCalled();
    });

    it('applies with confirmed true after the person confirms, and reports skipped houses', async () => {
      api.previewBulkRatePeriod.mockResolvedValue(preview);
      api.applyBulkRatePeriod.mockResolvedValue({ propertyId: 'p1', addedHouseIds: ['h1', 'h2'], skippedHouseIds: ['h3'] });
      const { result } = setup();
      await waitFor(() => expect(api.fetchRatePeriods).toHaveBeenCalled());
      await fillDraft(result, { applyToAll: true });
      await act(async () => {
        await result.current.save();
      });

      await act(async () => {
        await result.current.confirmBulk();
      });

      expect(api.applyBulkRatePeriod).toHaveBeenCalledWith('p1', expect.objectContaining({ houseIds: HOUSES, confirmed: true }));
      expect(result.current.notice).toBe('Added to 2 stays, skipped 1 with a date clash');
      expect(result.current.bulkWarning).toBeNull();
    });

    it('does nothing when the warning is cancelled', async () => {
      api.previewBulkRatePeriod.mockResolvedValue(preview);
      const { result } = setup();
      await waitFor(() => expect(api.fetchRatePeriods).toHaveBeenCalled());
      await fillDraft(result, { applyToAll: true });
      await act(async () => {
        await result.current.save();
      });

      act(() => result.current.cancelBulk());

      expect(result.current.bulkWarning).toBeNull();
      expect(api.applyBulkRatePeriod).not.toHaveBeenCalled();
      expect(result.current.draft.label).toBe('Peak summer');
    });

    it('closes the warning and shows the error when applying fails', async () => {
      api.previewBulkRatePeriod.mockResolvedValue(preview);
      api.applyBulkRatePeriod.mockRejectedValue(new ApiRequestError('Another change landed', 409));
      const { result } = setup();
      await waitFor(() => expect(api.fetchRatePeriods).toHaveBeenCalled());
      await fillDraft(result, { applyToAll: true });
      await act(async () => {
        await result.current.save();
      });

      await act(async () => {
        await result.current.confirmBulk();
      });

      expect(result.current.error).toBe('Another change landed');
      expect(result.current.bulkWarning).toBeNull();
    });
  });
});
