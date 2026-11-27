/**
 * @file apps/api/src/shared/http/request-context.ts
 * @shared Who is calling and which request this is, for code that has no request object
 * @dependencies node:async_hooks
 *
 * The audit log needs the caller's network and the request id when a service writes a row INSIDE its own database
 * transaction (docs/13 R6-05). Services do not see the request, so the middleware keeps the two values here for the
 * life of the request. Outside a request (a script, a test) there is no context and both are simply absent.
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import { clientIp } from './client-ip';
import type { RequestWithId } from './request-id';

export interface RequestContext {
  /** The caller's address as `clientIp` reads it; hashed before it is stored anywhere. */
  ip: string | undefined;
  requestId: string | undefined;
}

const storage = new AsyncLocalStorage<RequestContext>();

/** The context of the request being handled, or an empty one outside a request. */
export function currentRequestContext(): RequestContext {
  return storage.getStore() ?? { ip: undefined, requestId: undefined };
}

/** Runs `next` with this request's context. */
export function requestContextMiddleware(request: Pick<RequestWithId, 'ip' | 'requestId'>, _response: unknown, next: () => void): void {
  storage.run({ ip: clientIp(request), requestId: request.requestId }, next);
}

/** For tests: run code as if it were inside a request. */
export function runWithRequestContext<T>(context: RequestContext, fn: () => T): T {
  return storage.run(context, fn);
}
