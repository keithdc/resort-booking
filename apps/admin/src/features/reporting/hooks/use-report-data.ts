/**
 * @file apps/admin/src/features/reporting/hooks/use-report-data.ts
 * @feature reporting
 * @dependencies staff property and report APIs
 */

'use client';

import type { PropertySummary, StaffReport } from '@resort-booking/shared-types';
import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchStaffProperties } from '@/features/property/services/staff-property-api';
import { fetchStaffReport } from '@/features/reservations/services/staff-reservations-api';
import { ApiRequestError } from '@/shared/services/api-client';

export interface ReportData {
  properties: PropertySummary[];
  report: StaffReport | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

/**
 * Loads the report for a period and property, and the property list once. A slower earlier answer
 * never replaces a newer one. `range` null means nothing to load yet (a custom period being typed).
 */
export function useReportData(range: { from: string; to: string } | null, propertyId: string): ReportData {
  const [properties, setProperties] = useState<PropertySummary[]>([]);
  const [report, setReport] = useState<StaffReport | null>(null);
  const [loading, setLoading] = useState(range !== null);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const latest = useRef(0);
  const from = range?.from ?? null;
  const to = range?.to ?? null;

  useEffect((): void => {
    fetchStaffProperties()
      .then(setProperties)
      .catch((): void => {
        // The property filter just stays on "All properties"; the report itself reports its own errors.
        setProperties([]);
      });
  }, []);

  useEffect((): void => {
    if (from === null || to === null) {
      setLoading(false);
      return;
    }
    latest.current += 1;
    const mine = latest.current;
    setLoading(true);
    setError(null);
    fetchStaffReport(from, to, propertyId)
      .then((next: StaffReport): void => {
        if (mine === latest.current) {
          setReport(next);
        }
      })
      .catch((err: unknown): void => {
        if (mine === latest.current) {
          setError(err instanceof ApiRequestError ? err.message : 'Could not load reports');
        }
      })
      .finally((): void => {
        if (mine === latest.current) {
          setLoading(false);
        }
      });
  }, [from, to, propertyId, version]);

  const reload = useCallback((): void => {
    setVersion((value: number): number => value + 1);
  }, []);

  return { properties, report, loading, error, reload };
}
