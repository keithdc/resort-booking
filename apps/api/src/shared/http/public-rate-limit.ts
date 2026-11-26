/**
 * @file apps/api/src/shared/http/public-rate-limit.ts
 * @shared Per-IP limits for public routes that cost a database query (docs/13 R2-14)
 * @dependencies RedisService, ConfigService, enforceWindowLimit
 */

import { applyDecorators, CanActivate, ExecutionContext, Injectable, Logger, SetMetadata, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { enforceWindowLimit, limitSettingFromConfig, type LimitSetting } from '../redis/rate-limit';
import { RedisService } from '../redis/redis.service';
import { clientIp } from './client-ip';

/** Which budget a route draws from. Every bucket counts per client network (see `clientIp`). */
export type PublicBucket = 'read' | 'payment';

/** Cheap public reads (property pages, offers, extras, a hold): about 5 per second per network. Env PUBLIC_READ_LIMIT / PUBLIC_READ_WINDOW_SECONDS. */
export const PUBLIC_READ_DEFAULT: LimitSetting = { limit: 300, windowSeconds: 60 };
/** Starting or settling a payment: a guest retries a card a few times, never 30 in ten minutes. Env PUBLIC_PAYMENT_LIMIT / PUBLIC_PAYMENT_WINDOW_SECONDS. */
export const PUBLIC_PAYMENT_DEFAULT: LimitSetting = { limit: 30, windowSeconds: 600 };

const BUCKET_METADATA = 'public-rate-limit-bucket';

const MESSAGES: Readonly<Record<PublicBucket, { code: string; message: string }>> = {
  read: { code: 'PUBLIC_RATE_LIMITED', message: 'Too many requests. Please slow down and try again in a moment.' },
  payment: { code: 'PAYMENT_RATE_LIMITED', message: 'Too many payment attempts. Please wait a few minutes and try again.' },
};

/**
 * Counts one request per client network in the bucket named by `@PublicRateLimit(bucket)` and answers 429 with
 * Retry-After once over. Same policy as the other guest limiters: if Redis is unreachable the check is skipped
 * with a warning (guests must still be able to browse and pay; login and 2FA are the fail-closed ones).
 */
@Injectable()
export class PublicRateLimitGuard implements CanActivate {
  private readonly logger = new Logger(PublicRateLimitGuard.name);
  private readonly settings: Readonly<Record<PublicBucket, LimitSetting>>;

  public constructor(
    private readonly redis: RedisService,
    private readonly reflector: Reflector,
    config: ConfigService,
  ) {
    this.settings = {
      read: limitSettingFromConfig(config, 'PUBLIC_READ', PUBLIC_READ_DEFAULT),
      payment: limitSettingFromConfig(config, 'PUBLIC_PAYMENT', PUBLIC_PAYMENT_DEFAULT),
    };
  }

  /** Counts the request; throws 429 over the limit. A route without the decorator is not limited here. */
  public async canActivate(context: ExecutionContext): Promise<boolean> {
    const bucket = this.reflector.get<PublicBucket | undefined>(BUCKET_METADATA, context.getHandler());
    if (bucket === undefined) {
      return true;
    }
    const request = context.switchToHttp().getRequest<Request>();
    await enforceWindowLimit(this.redis, this.logger, {
      keyPrefix: `ratelimit:public:${bucket}:`,
      callerId: clientIp(request),
      ...this.settings[bucket],
      ...MESSAGES[bucket],
    });
    return true;
  }
}

/** Puts a public route in a per-IP bucket (and installs the guard that counts it). */
export function PublicRateLimit(bucket: PublicBucket): MethodDecorator {
  return applyDecorators(SetMetadata(BUCKET_METADATA, bucket), UseGuards(PublicRateLimitGuard));
}
