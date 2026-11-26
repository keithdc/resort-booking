/**
 * @file apps/api/src/shared/http/webhook-raw-body.ts
 * @shared Raw request bytes for the payment webhook route only, with a strict size limit
 * @dependencies none
 */

/** Where the payment provider posts. Signature checks need the exact bytes, so only this route keeps them. */
export const WEBHOOK_PATH_PREFIX = '/payments/webhooks/';

/** A webhook body larger than this is refused (413) before it is read. Real events are a few kilobytes. */
export const WEBHOOK_MAX_BODY_BYTES = 64 * 1024;

/** The part of a request these middlewares read or change. */
export interface WebhookRequestLike {
  method?: string | undefined;
  originalUrl?: string | undefined;
  url?: string | undefined;
  headers: Readonly<Record<string, string | string[] | undefined>>;
  rawBody?: Buffer | undefined;
}

/** The part of a response the size guard writes. */
export interface WebhookResponseLike {
  status(code: number): { json(body: unknown): unknown };
}

function pathOf(request: WebhookRequestLike): string {
  return (request.originalUrl ?? request.url ?? '').split('?')[0] ?? '';
}

function isWebhook(request: WebhookRequestLike): boolean {
  return request.method === 'POST' && pathOf(request).startsWith(WEBHOOK_PATH_PREFIX);
}

/**
 * Runs BEFORE the body parsers: a webhook that announces a body over the limit is a 413 without being read. (A body with
 * no announced length is still capped by the handler, and by the 100 kB parser limit.)
 */
export function webhookSizeGuard(request: WebhookRequestLike, response: WebhookResponseLike, next: () => void): void {
  if (isWebhook(request)) {
    const header = request.headers['content-length'];
    const length = Number(Array.isArray(header) ? header[0] : header);
    if (Number.isFinite(length) && length > WEBHOOK_MAX_BODY_BYTES) {
      response.status(413).json({ status: 'error', message: 'Payload too large', code: 'PAYLOAD_TOO_LARGE' });
      return;
    }
  }
  next();
}

/**
 * Runs AFTER the body parsers (which keep `rawBody` for every JSON request when Nest's `rawBody` option is on): drops
 * the raw bytes everywhere except the webhook route, so nothing else holds or can rely on them.
 */
export function dropRawBodyOutsideWebhooks(request: WebhookRequestLike, _response: unknown, next: () => void): void {
  if (!isWebhook(request) && request.rawBody !== undefined) {
    delete request.rawBody;
  }
  next();
}
