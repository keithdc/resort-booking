/**
 * @file apps/admin/src/features/registration/components/session-errors.ts
 * @feature registration
 * @dependencies api-client
 */

import { ApiRequestError } from '@/shared/services/api-client';

/** Text for a failed register or accept call; the API's own message is already plain language. */
export function submitErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiRequestError) {
    if (error.problems.length > 0) {
      return `${error.message} ${error.problems.join('. ')}.`;
    }
    return error.message;
  }
  return fallback;
}
