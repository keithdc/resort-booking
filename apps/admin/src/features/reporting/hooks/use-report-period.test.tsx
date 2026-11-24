// @vitest-environment jsdom
/**
 * @file apps/admin/src/features/reporting/hooks/use-report-period.test.tsx
 * @feature reporting
 */

import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { useReportPeriod } from './use-report-period';

const NOW = new Date(2027, 6, 15);

describe('useReportPeriod', () => {
  afterEach(cleanup);

  it('starts on this month', () => {
    const { result } = renderHook(() => useReportPeriod(NOW));

    expect(result.current.preset).toBe('this_month');
    expect(result.current.range).toEqual({ from: '2027-07-01', to: '2027-08-01' });
    expect(result.current.problem).toBeNull();
  });

  it('follows the preset', () => {
    const { result } = renderHook(() => useReportPeriod(NOW));

    act(() => result.current.setPreset('last_month'));

    expect(result.current.range).toEqual({ from: '2027-06-01', to: '2027-07-01' });
  });

  it('has no range and no complaint while a custom period is still empty', () => {
    const { result } = renderHook(() => useReportPeriod(NOW));

    act(() => result.current.setPreset('custom'));

    expect(result.current.range).toBeNull();
    expect(result.current.problem).toBeNull();
  });

  it('makes a custom range once both days are valid', () => {
    const { result } = renderHook(() => useReportPeriod(NOW));

    act(() => {
      result.current.setPreset('custom');
      result.current.setFirstDay('2027-03-01');
      result.current.setLastDay('2027-03-10');
    });

    expect(result.current.range).toEqual({ from: '2027-03-01', to: '2027-03-11' });
  });

  it('explains a custom period that is wrong', () => {
    const { result } = renderHook(() => useReportPeriod(NOW));

    act(() => {
      result.current.setPreset('custom');
      result.current.setFirstDay('2027-03-10');
      result.current.setLastDay('2027-03-01');
    });

    expect(result.current.range).toBeNull();
    expect(result.current.problem).toMatch(/before the first day/);
  });

  it('explains a half-filled custom period', () => {
    const { result } = renderHook(() => useReportPeriod(NOW));

    act(() => {
      result.current.setPreset('custom');
      result.current.setFirstDay('2027-03-10');
    });

    expect(result.current.problem).toMatch(/first and a last day/);
  });
});
