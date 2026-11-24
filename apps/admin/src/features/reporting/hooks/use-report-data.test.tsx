// @vitest-environment jsdom
/**
 * @file apps/admin/src/features/reporting/hooks/use-report-data.test.tsx
 * @feature reporting
 */

import type { PropertySummary, StaffReport } from '@resort-booking/shared-types';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiRequestError } from '@/shared/services/api-client';
import { staffReport } from '@/test/fixtures';
import { useReportData } from './use-report-data';

const api = vi.hoisted(() => ({
  fetchStaffProperties: vi.fn<() => Promise<PropertySummary[]>>(),
  fetchStaffReport: vi.fn<(from: string, to: string, propertyId: string) => Promise<StaffReport>>(),
}));

vi.mock('@/features/property/services/staff-property-api', () => ({ fetchStaffProperties: api.fetchStaffProperties }));
vi.mock('@/features/reservations/services/staff-reservations-api', () => ({ fetchStaffReport: api.fetchStaffReport }));

const RANGE = { from: '2027-07-01', to: '2027-08-01' };

describe('useReportData', () => {
  beforeEach(() => {
    api.fetchStaffProperties.mockReset().mockResolvedValue([]);
    api.fetchStaffReport.mockReset().mockResolvedValue(staffReport());
  });

  afterEach(cleanup);

  it('loads the report for the period and property, showing loading first', async () => {
    const { result } = renderHook(() => useReportData(RANGE, 'p1'));

    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.report).not.toBeNull());

    expect(api.fetchStaffReport).toHaveBeenCalledWith('2027-07-01', '2027-08-01', 'p1');
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('loads the property list once, however often the period changes', async () => {
    const { result, rerender } = renderHook(({ range }) => useReportData(range, ''), { initialProps: { range: RANGE } });
    await waitFor(() => expect(result.current.report).not.toBeNull());

    rerender({ range: { from: '2027-08-01', to: '2027-09-01' } });
    await waitFor(() => expect(api.fetchStaffReport).toHaveBeenCalledTimes(2));

    expect(api.fetchStaffProperties).toHaveBeenCalledTimes(1);
  });

  it('shows the API message when the report fails, and keeps going without the property list', async () => {
    api.fetchStaffProperties.mockRejectedValue(new Error('down'));
    api.fetchStaffReport.mockRejectedValue(new ApiRequestError('Report/calendar range must have a check-out after check-in', 400));

    const { result } = renderHook(() => useReportData(RANGE, ''));
    await waitFor(() => expect(result.current.error).not.toBeNull());

    expect(result.current.error).toMatch(/check-out after check-in/);
    expect(result.current.properties).toEqual([]);
    expect(result.current.loading).toBe(false);
  });

  it('uses a plain message for an unexpected failure', async () => {
    api.fetchStaffReport.mockRejectedValue(new Error('boom'));

    const { result } = renderHook(() => useReportData(RANGE, ''));
    await waitFor(() => expect(result.current.error).toBe('Could not load reports'));
  });

  it('does not load while a custom period has no range yet', async () => {
    const { result } = renderHook(() => useReportData(null, ''));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(api.fetchStaffReport).not.toHaveBeenCalled();
    expect(result.current.report).toBeNull();
  });

  it('never lets a slower earlier answer replace a newer one', async () => {
    let finishFirst: (report: StaffReport) => void = () => undefined;
    api.fetchStaffReport.mockImplementationOnce(() => new Promise<StaffReport>((resolve) => { finishFirst = resolve; }));
    api.fetchStaffReport.mockResolvedValueOnce(staffReport({ revenueCents: 222 }));

    const { result, rerender } = renderHook(({ range }) => useReportData(range, ''), { initialProps: { range: RANGE } });
    rerender({ range: { from: '2027-08-01', to: '2027-09-01' } });
    await waitFor(() => expect(result.current.report?.revenueCents).toBe(222));

    await act(async () => {
      finishFirst(staffReport({ revenueCents: 111 }));
    });

    expect(result.current.report?.revenueCents).toBe(222);
  });

  it('asks again when told to reload', async () => {
    const { result } = renderHook(() => useReportData(RANGE, ''));
    await waitFor(() => expect(result.current.report).not.toBeNull());

    act(() => result.current.reload());

    await waitFor(() => expect(api.fetchStaffReport).toHaveBeenCalledTimes(2));
  });
});
