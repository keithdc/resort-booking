/**
 * @file apps/admin/src/features/team/hooks/use-team.ts
 * @feature team
 * @dependencies team-api
 */

'use client';

import type { TeamOverview } from '@resort-booking/shared-types';
import { useCallback, useEffect, useState } from 'react';
import { fetchTeam } from '../services/team-api';
import { teamErrorMessage } from '../utils/team-messages';

export interface TeamState {
  overview: TeamOverview | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

/**
 * Loads the members and open invitations; `reload` refreshes after any change.
 */
export function useTeam(): TeamState {
  const [overview, setOverview] = useState<TeamOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  useEffect((): (() => void) => {
    let cancelled = false;
    setLoading(true);
    fetchTeam()
      .then((next): void => {
        if (!cancelled) {
          setOverview(next);
          setError(null);
        }
      })
      .catch((err: unknown): void => {
        if (!cancelled) {
          setError(teamErrorMessage(err, 'Could not load the team'));
        }
      })
      .finally((): void => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return (): void => {
      cancelled = true;
    };
  }, [version]);

  const reload = useCallback((): void => setVersion((value: number): number => value + 1), []);
  return { overview, loading, error, reload };
}
