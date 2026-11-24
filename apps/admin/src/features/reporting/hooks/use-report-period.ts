/**
 * @file apps/admin/src/features/reporting/hooks/use-report-period.ts
 * @feature reporting
 * @dependencies report-range
 *
 * The chosen period: a preset or two custom days. Gives the API range, or what is wrong with it.
 */

'use client';

import { useMemo, useState } from 'react';
import {
  customRange,
  DEFAULT_REPORT_PRESET,
  rangeFromPreset,
  type RangePreset,
} from '../utils/report-range';

export interface ReportPeriod {
  preset: RangePreset;
  setPreset: (preset: RangePreset) => void;
  firstDay: string;
  lastDay: string;
  setFirstDay: (day: string) => void;
  setLastDay: (day: string) => void;
  /** The range to ask the API for, or null while a custom period is incomplete or invalid. */
  range: { from: string; to: string } | null;
  /** Why the custom period cannot be used yet, else null. */
  problem: string | null;
}

/**
 * State for the period picker. `now` is only read when the page opens, so the range stays put.
 */
export function useReportPeriod(now: Date = new Date()): ReportPeriod {
  const [preset, setPreset] = useState<RangePreset>(DEFAULT_REPORT_PRESET);
  const [today] = useState<Date>(now);
  const [firstDay, setFirstDay] = useState('');
  const [lastDay, setLastDay] = useState('');

  const resolved = useMemo((): { range: { from: string; to: string } | null; problem: string | null } => {
    if (preset !== 'custom') {
      return { range: rangeFromPreset(preset, today), problem: null };
    }
    if (firstDay === '' && lastDay === '') {
      return { range: null, problem: null };
    }
    const custom = customRange(firstDay, lastDay);
    return { range: custom.range, problem: custom.problem };
  }, [preset, today, firstDay, lastDay]);

  return { preset, setPreset, firstDay, lastDay, setFirstDay, setLastDay, range: resolved.range, problem: resolved.problem };
}
