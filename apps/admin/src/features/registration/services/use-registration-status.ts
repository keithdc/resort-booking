/**
 * @file apps/admin/src/features/registration/services/use-registration-status.ts
 * @feature registration
 * @dependencies registration-api
 */

'use client';

import { useEffect, useState } from 'react';
import { fetchRegistrationStatus } from './registration-api';

export type RegistrationState = 'loading' | 'open' | 'closed' | 'unknown';

/**
 * Asks the API once whether new workspaces can be registered. A failed call is "unknown" (the page says so);
 * the login link treats unknown like closed.
 */
export function useRegistrationStatus(): RegistrationState {
  const [state, setState] = useState<RegistrationState>('loading');
  useEffect((): (() => void) => {
    let cancelled = false;
    fetchRegistrationStatus()
      .then((status): void => {
        if (!cancelled) {
          setState(status.open ? 'open' : 'closed');
        }
      })
      .catch((): void => {
        if (!cancelled) {
          setState('unknown');
        }
      });
    return (): void => {
      cancelled = true;
    };
  }, []);
  return state;
}
