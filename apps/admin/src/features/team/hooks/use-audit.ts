/**
 * @file apps/admin/src/features/team/hooks/use-audit.ts
 * @feature team
 * @dependencies team-api, audit-labels
 */

'use client';

import type { AuditRecord } from '@resort-booking/shared-types';
import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchAudit } from '../services/team-api';
import { exclusiveEnd } from '../utils/audit-labels';
import { teamErrorMessage } from '../utils/team-messages';

export interface AuditFilterState {
  /** Action prefix such as "team."; empty for everything. */
  category: string;
  /** Inclusive dates ("2026-11-01") or empty. */
  from: string;
  to: string;
}

export const AUDIT_PAGE_SIZE = 25;

export interface AuditState {
  records: AuditRecord[];
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  hasMore: boolean;
  loadMore: () => void;
  reload: () => void;
}

/**
 * Loads the first page when the filters change and appends older pages on "Load more". A slower answer for
 * filters that were since changed never replaces a newer one.
 */
export function useAudit(filters: AuditFilterState): AuditState {
  const [records, setRecords] = useState<AuditRecord[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const latest = useRef(0);
  const { category, from, to } = filters;

  const query = useCallback(
    (after: string | null): Parameters<typeof fetchAudit>[0] => ({
      limit: AUDIT_PAGE_SIZE,
      ...(category === '' ? {} : { action: category }),
      ...(from === '' ? {} : { from }),
      ...(to === '' ? {} : { to: exclusiveEnd(to) }),
      ...(after === null ? {} : { cursor: after }),
    }),
    [category, from, to],
  );

  useEffect((): void => {
    latest.current += 1;
    const mine = latest.current;
    setLoading(true);
    setError(null);
    fetchAudit(query(null))
      .then((page): void => {
        if (mine === latest.current) {
          setRecords(page.items);
          setCursor(page.nextCursor);
        }
      })
      .catch((err: unknown): void => {
        if (mine === latest.current) {
          setError(teamErrorMessage(err, 'Could not load the audit log'));
        }
      })
      .finally((): void => {
        if (mine === latest.current) {
          setLoading(false);
        }
      });
  }, [query, version]);

  const loadMore = useCallback((): void => {
    if (cursor === null) {
      return;
    }
    const mine = latest.current;
    setLoadingMore(true);
    fetchAudit(query(cursor))
      .then((page): void => {
        if (mine === latest.current) {
          setRecords((current): AuditRecord[] => [...current, ...page.items]);
          setCursor(page.nextCursor);
        }
      })
      .catch((err: unknown): void => {
        if (mine === latest.current) {
          setError(teamErrorMessage(err, 'Could not load more'));
        }
      })
      .finally((): void => setLoadingMore(false));
  }, [cursor, query]);

  const reload = useCallback((): void => setVersion((value: number): number => value + 1), []);
  return { records, loading, loadingMore, error, hasMore: cursor !== null, loadMore, reload };
}
