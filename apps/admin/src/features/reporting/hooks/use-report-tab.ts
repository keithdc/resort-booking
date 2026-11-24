/**
 * @file apps/admin/src/features/reporting/hooks/use-report-tab.ts
 * @feature reporting
 * @dependencies next/navigation
 *
 * The open tab lives in the page address (?tab=bookings), so a refresh or a shared link opens the
 * same tab.
 */

'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback } from 'react';
import type { ReportTabKey } from '../utils/metric-definitions';
import { tabFromParam } from '../utils/report-tabs';

export interface ReportTabState {
  tab: ReportTabKey;
  setTab: (tab: ReportTabKey) => void;
}

/**
 * Reads and writes ?tab= without adding history entries or scrolling the page.
 */
export function useReportTab(): ReportTabState {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const tab = tabFromParam(params.get('tab'));

  const setTab = useCallback(
    (next: ReportTabKey): void => {
      const query = new URLSearchParams(params.toString());
      query.set('tab', next);
      router.replace(`${pathname}?${query.toString()}`, { scroll: false });
    },
    [params, pathname, router],
  );

  return { tab, setTab };
}
