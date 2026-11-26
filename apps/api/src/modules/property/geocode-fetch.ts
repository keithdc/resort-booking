/**
 * @file apps/api/src/modules/property/geocode-fetch.ts
 * @feature property
 * @dependencies none
 */

/** An upstream that has not answered after this long is given up on (the admin form just shows no suggestions). */
export const GEOCODE_TIMEOUT_MS = 5000;

/** An upstream answer larger than this is dropped unread: a place lookup is a few kilobytes. */
export const GEOCODE_MAX_BYTES = 256 * 1024;

/** The part of `fetch` this uses, so tests can stand in for the network. */
export type Fetcher = (url: URL, init: RequestInit) => Promise<Response>;

/**
 * GETs a geocoding URL with a hard timeout and a size cap and parses the JSON. Any failure (network, timeout, a
 * non-200 answer, too large, not JSON) is null: callers treat it as "no result", never as an error. The timeout covers
 * reading the body too, so a slow trickle cannot pin the request.
 */
export async function fetchBoundedJson(
  url: URL,
  headers: Readonly<Record<string, string>>,
  fetcher: Fetcher = fetch,
  timeoutMs: number = GEOCODE_TIMEOUT_MS,
  maxBytes: number = GEOCODE_MAX_BYTES,
): Promise<unknown> {
  try {
    const response = await fetcher(url, { headers: { ...headers }, signal: AbortSignal.timeout(timeoutMs) });
    if (!response.ok || response.body === null) {
      return null;
    }
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
  } catch {
    return null;
  }
}
