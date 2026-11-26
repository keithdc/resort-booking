/**
 * @file apps/api/src/shared/http/public-routes.spec.ts
 * @shared Every public (non-staff) route has a rate limit, or a reviewed reason why not (docs/13 R2-14)
 *
 * Reads the controllers' metadata like the tenant isolation suite. A new public route fails here until it carries
 * `@PublicRateLimit(...)` or is added to OTHER_PROTECTION with the protection that stands in front of it.
 */

import 'reflect-metadata';
import { RequestMethod } from '@nestjs/common';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { StaffGuard } from '../../modules/identity/staff.guard';
import { PublicRateLimitGuard } from './public-rate-limit';

/** Public routes that do not use the shared guard, and what limits them instead. Reviewed by hand. */
const OTHER_PROTECTION: Record<string, string> = {
  'POST /bookings/lookup': 'BookingRateLimiter (per IP and per booking reference)',
  'POST /bookings/cancel': 'BookingRateLimiter',
  'POST /bookings/rebook/availability': 'BookingRateLimiter',
  'POST /bookings/rebook/quote': 'BookingRateLimiter',
  'POST /bookings/rebook': 'BookingRateLimiter',
  'GET /quotes': 'HoldRateLimiter.checkBrowse and PromoRateLimiter',
  'GET /search': 'HoldRateLimiter.checkBrowse',
  'GET /properties/:slug/houses/:houseSlug/availability': 'HoldRateLimiter.checkBrowse',
  'GET /properties/:slug/availability': 'HoldRateLimiter.checkBrowse',
  'POST /holds': 'HoldRateLimiter.checkHold (per IP and per email) and the open-hold caps',
  'POST /payments/webhooks/:provider': 'PaymentWebhookService limit per IP, then the signature check',
  'GET /health': 'liveness probe for load balancers: one boolean, must never be throttled into a false "down"',
  'POST /staff/login': 'LoginLimiter (fails closed)',
  'POST /staff/login/two-factor': 'TwoFactorLimiter (fails closed)',
  'POST /staff/logout': 'open item of docs/13 R2-14: a token delete, no data read',
  'GET /staff/register/status': 'no database or Redis access: answers from configuration',
  'POST /staff/register': 'TeamLimiter (per IP) and closed registration in production',
  'GET /staff/invites/:token/preview': 'TeamLimiter and a token shape check',
  'POST /staff/invites/accept': 'TeamLimiter',
};

const MODULES_DIR = join(__dirname, '../../modules');

function controllerFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name: string): string[] => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      return controllerFiles(path);
    }
    return name.endsWith('.controller.ts') ? [path] : [];
  });
}

function joinPath(...parts: string[]): string {
  return `/${parts.map((part) => part.replace(/^\/+|\/+$/g, '')).filter((part) => part !== '').join('/')}`;
}

function guardsOf(target: object): unknown[] {
  const guards: unknown = Reflect.getMetadata('__guards__', target);
  return Array.isArray(guards) ? (guards as unknown[]) : [];
}

/** key -> whether the route carries the shared limiter, for every route no StaffGuard protects. */
function publicRoutes(): Map<string, boolean> {
  const routes = new Map<string, boolean>();
  for (const file of controllerFiles(MODULES_DIR)) {
    const exported = jest.requireActual<Record<string, unknown>>(file);
    for (const value of Object.values(exported)) {
      if (typeof value !== 'function' || Reflect.getMetadata('path', value) === undefined) {
        continue;
      }
      const prefix = String(Reflect.getMetadata('path', value));
      for (const name of Object.getOwnPropertyNames(value.prototype)) {
        const handler: unknown = (value.prototype as Record<string, unknown>)[name];
        if (typeof handler !== 'function' || Reflect.getMetadata('method', handler) === undefined) {
          continue;
        }
        const guards = [...guardsOf(value), ...guardsOf(handler)];
        if (guards.includes(StaffGuard)) {
          continue;
        }
        const key = `${RequestMethod[Number(Reflect.getMetadata('method', handler))] ?? '?'} ${joinPath(prefix, String(Reflect.getMetadata('path', handler)))}`;
        routes.set(key, guards.includes(PublicRateLimitGuard));
      }
    }
  }
  return routes;
}

describe('public routes and rate limits', () => {
  const routes = publicRoutes();

  it('finds the public routes', () => {
    expect(routes.size).toBeGreaterThan(20);
    expect(routes.get('GET /properties/:slug')).toBe(true);
  });

  it('gives every public route the shared limiter or a reviewed alternative', () => {
    const unprotected = [...routes].filter(([key, limited]) => !limited && OTHER_PROTECTION[key] === undefined).map(([key]) => key);

    expect(unprotected).toEqual([]);
  });

  it('keeps the reviewed table honest: no entry for a route that has the guard or no longer exists', () => {
    const stale = Object.keys(OTHER_PROTECTION).filter((key) => routes.get(key) !== false);

    expect(stale).toEqual([]);
  });

  it.each([
    'POST /holds/:holdId/payment',
    'POST /payments/:paymentId/mock/complete',
    'GET /holds/:id',
    'GET /properties',
    'GET /properties/:slug/houses',
    'GET /properties/:slug/extras',
    'GET /properties/:slug/offers',
    'GET /properties/:slug/request-options',
    'GET /properties/:slug/cancellation-policy',
    'GET /identity/organization',
  ])('limits %s', (key) => {
    expect(routes.get(key)).toBe(true);
  });
});
