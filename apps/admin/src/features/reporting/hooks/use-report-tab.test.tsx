// @vitest-environment jsdom
/**
 * @file apps/admin/src/features/reporting/hooks/use-report-tab.test.tsx
 * @feature reporting
 */

import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useReportTab } from './use-report-tab';

const navigation = vi.hoisted(() => ({ query: '', replace: vi.fn<(url: string, options: { scroll: boolean }) => void>() }));

vi.mock('next/navigation', () => ({
  useRouter: (): { replace: typeof navigation.replace } => ({ replace: navigation.replace }),
  usePathname: (): string => '/reports',
  useSearchParams: (): URLSearchParams => new URLSearchParams(navigation.query),
}));

describe('useReportTab', () => {
  beforeEach(() => {
    navigation.query = '';
    navigation.replace.mockReset();
  });

  afterEach(cleanup);

  it('opens the overview when the address names no tab', () => {
    const { result } = renderHook(() => useReportTab());
    expect(result.current.tab).toBe('overview');
  });

  it('opens the tab named in the address', () => {
    navigation.query = 'tab=cancellations';
    const { result } = renderHook(() => useReportTab());
    expect(result.current.tab).toBe('cancellations');
  });

  it('ignores an unknown tab name', () => {
    navigation.query = 'tab=pipeline';
    const { result } = renderHook(() => useReportTab());
    expect(result.current.tab).toBe('overview');
  });

  it('writes the chosen tab into the address without scrolling, keeping other parameters', () => {
    navigation.query = 'foo=1';
    const { result } = renderHook(() => useReportTab());

    act(() => result.current.setTab('bookings'));

    expect(navigation.replace).toHaveBeenCalledWith('/reports?foo=1&tab=bookings', { scroll: false });
  });
});
