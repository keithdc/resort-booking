/**
 * @file apps/api/src/shared/http/request-id.ts
 * @shared Gives every request an id that appears in logs and in error bodies
 * @dependencies node:crypto
 */

import { randomUUID } from 'node:crypto';
import type { Request } from 'express';

/** A request that went through the request id middleware. */
export interface RequestWithId extends Request {
  requestId?: string;
}

/** The part of a request the middleware needs (narrow, so it is easy to test). */
export interface RequestIdCarrier {
  header(name: string): string | undefined;
  requestId?: string;
}

/** The part of a response the middleware needs. */
export interface HeaderSetter {
  setHeader(name: string, value: string): unknown;
}

const VALID_REQUEST_ID = /^[A-Za-z0-9._-]{8,64}$/;

/**
 * Keeps a caller-supplied id only when it is short and made of safe characters (it ends up in logs and
 * headers); otherwise makes a new one.
 */
export function resolveRequestId(incoming: string | undefined): string {
  return incoming !== undefined && VALID_REQUEST_ID.test(incoming) ? incoming : randomUUID();
}

/**
 * Express middleware: sets `request.requestId` and the `x-request-id` response header.
 */
export function requestIdMiddleware(request: RequestIdCarrier, response: HeaderSetter, next: () => void): void {
  const id = resolveRequestId(request.header('x-request-id'));
  request.requestId = id;
  response.setHeader('x-request-id', id);
  next();
}
