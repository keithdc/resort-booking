/**
 * @file apps/web/src/shared/services/or-not-found.ts
 * @shared Turns an API "not found" into the site's 404 page
 * @dependencies api-client
 */

import { notFound } from 'next/navigation';
import { ApiRequestError } from './api-client';

/**
 * Waits for a load and, when the API answers 404 (an unknown or unpublished property or stay), shows the 404 page
 * with a real 404 status instead of an error page, so search engines drop the address. Any other failure is
 * rethrown unchanged.
 */
export async function orNotFound<T>(load: Promise<T>): Promise<T> {
  try {
    return await load;
  } catch (error: unknown) {
    if (error instanceof ApiRequestError && error.status === 404) {
      notFound();
    }
    throw error;
  }
}

/**
 * Same for page metadata: a 404 shows the 404 page, and any other failure gives the fallback, so a hiccup in the
 * API never breaks a page that can still render.
 */
export async function orNotFoundOr<T, F>(load: Promise<T>, fallback: F): Promise<T | F> {
  try {
    return await load;
  } catch (error: unknown) {
    if (error instanceof ApiRequestError && error.status === 404) {
      notFound();
    }
    return fallback;
  }
}
