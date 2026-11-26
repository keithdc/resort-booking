/**
 * @file apps/api/src/modules/identity/login-limiter.ts
 * @feature identity
 * @dependencies RedisService
 */

import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { readIntEnv } from '../../shared/config/environment';
import { fingerprint } from '../../shared/http/client-ip';
import { RateLimitedException } from '../../shared/http/rate-limited.exception';
import { RedisService } from '../../shared/redis/redis.service';

export const LOGIN_MAX_FAILURES_PER_EMAIL = 5;
export const LOGIN_MAX_FAILURES_PER_IP = 20;
export const LOGIN_WINDOW_SECONDS = 900;
const EMAIL_PREFIX = 'ratelimit:login:email:';
const IP_PREFIX = 'ratelimit:login:ip:';

/**
 * Brute-force protection for staff sign-in. It counts FAILED attempts only, per email (a hash, never the
 * address) and per IP, in fixed windows. Once either is over its limit, sign-in answers 429 with Retry-After
 * before any password is checked, so a locked account costs the attacker a request and us no hashing.
 * A success clears the email's counter.
 *
 * Redis down: login FAILS CLOSED (503). An attacker who can knock Redis over must not get unlimited
 * guesses; staff can retry as soon as Redis is back. (Guest endpoints, by contrast, fail open.)
 *
 * Tune with LOGIN_MAX_FAILURES_PER_EMAIL, LOGIN_MAX_FAILURES_PER_IP, LOGIN_LOCK_WINDOW_SECONDS.
 */
@Injectable()
export class LoginLimiter {
  private readonly logger = new Logger(LoginLimiter.name);
  private readonly perEmail: number;
  private readonly perIp: number;
  private readonly windowSeconds: number;
  private readonly salt: string;

  public constructor(
    private readonly redis: RedisService,
    config: ConfigService,
  ) {
    const value = (name: string): { v: string | undefined } => ({ v: config.get<string>(name) });
    this.perEmail = readIntEnv(value('LOGIN_MAX_FAILURES_PER_EMAIL'), 'v', LOGIN_MAX_FAILURES_PER_EMAIL, 1, 1000);
    this.perIp = readIntEnv(value('LOGIN_MAX_FAILURES_PER_IP'), 'v', LOGIN_MAX_FAILURES_PER_IP, 1, 10_000);
    this.windowSeconds = readIntEnv(value('LOGIN_LOCK_WINDOW_SECONDS'), 'v', LOGIN_WINDOW_SECONDS, 30, 86_400);
    this.salt = config.get<string>('IP_HASH_SALT') ?? '';
  }

  /**
   * Throws 429 LOGIN_RATE_LIMITED when this email or IP has too many recent failures, 503 when Redis cannot
   * be asked. Does not count anything.
   */
  public async assertAllowed(email: string, ip: string | undefined): Promise<void> {
    try {
      const [byEmail, byIp] = await Promise.all([
        this.redis.peekWindow(this.emailKey(email)),
        this.redis.peekWindow(this.ipKey(ip)),
      ]);
      if (byEmail.count >= this.perEmail) {
        throw this.limited('Too many failed sign-in attempts for this account.', byEmail.ttlSeconds);
      }
      if (byIp.count >= this.perIp) {
        throw this.limited('Too many failed sign-in attempts from this network.', byIp.ttlSeconds);
      }
    } catch (error: unknown) {
      if (error instanceof RateLimitedException) {
        throw error;
      }
      this.logger.error('Login limiter unavailable (Redis); refusing sign-in');
      throw new ServiceUnavailableException({
        message: 'Sign-in is temporarily unavailable. Please try again in a moment.',
        code: 'LOGIN_UNAVAILABLE',
      });
    }
  }

  /**
   * Counts one failed attempt against the email and the IP. Never throws: a Redis hiccup here must not turn a
   * wrong password into a server error (the next attempt's check fails closed anyway).
   */
  public async recordFailure(email: string, ip: string | undefined): Promise<void> {
    try {
      await Promise.all([
        this.redis.hitWindowWithTtl(this.emailKey(email), this.windowSeconds),
        this.redis.hitWindowWithTtl(this.ipKey(ip), this.windowSeconds),
      ]);
    } catch {
      this.logger.warn('Could not record a failed sign-in (Redis unavailable)');
    }
  }

  /**
   * Forgets the email's failures after a successful sign-in.
   */
  public async recordSuccess(email: string): Promise<void> {
    try {
      await this.redis.deleteKey(this.emailKey(email));
    } catch {
      this.logger.warn('Could not clear failed sign-ins (Redis unavailable)');
    }
  }

  private limited(message: string, ttlSeconds: number): RateLimitedException {
    return new RateLimitedException(
      'LOGIN_RATE_LIMITED',
      `${message} Please wait a few minutes and try again.`,
      ttlSeconds > 0 ? ttlSeconds : this.windowSeconds,
    );
  }

  private emailKey(email: string): string {
    return `${EMAIL_PREFIX}${fingerprint(email, this.salt)}`;
  }

  private ipKey(ip: string | undefined): string {
    return `${IP_PREFIX}${ip ?? 'unknown'}`;
  }
}
