/**
 * @file apps/api/src/modules/team/team-limiter.spec.ts
 * @feature team
 */

import { HttpException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { RedisService, type WindowState } from '../../shared/redis/redis.service';
import { INVITE_ACCEPT_DEFAULT, INVITE_EMAIL_ORG_DEFAULT, INVITE_EMAIL_RECIPIENT_DEFAULT, INVITE_PREVIEW_DEFAULT, REGISTRATION_DEFAULT, REGISTRATION_EMAIL_DEFAULT, TeamLimiter } from './team-limiter';

describe('TeamLimiter', () => {
  const hitWindowWithTtl = jest.fn<Promise<WindowState>, [string, number]>();
  let limiter: TeamLimiter;
  let env: Record<string, string>;

  async function build(): Promise<TeamLimiter> {
    const moduleRef = await Test.createTestingModule({
      providers: [
        TeamLimiter,
        { provide: RedisService, useValue: { hitWindowWithTtl } },
        { provide: ConfigService, useValue: { get: (name: string): string | undefined => env[name] } },
      ],
    }).compile();
    return moduleRef.get(TeamLimiter);
  }

  beforeEach(async () => {
    jest.resetAllMocks();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation((): void => undefined);
    env = { IP_HASH_SALT: 'pepper' };
    hitWindowWithTtl.mockResolvedValue({ count: 1, ttlSeconds: 100 });
    limiter = await build();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('counts a sign-up per IP and per email (the email only as a hash)', async () => {
    await limiter.checkRegistration('203.0.113.7', 'Ada@Example.com');

    const keys = hitWindowWithTtl.mock.calls.map((call) => call[0]);
    expect(keys[0]).toBe('ratelimit:register:ip:203.0.113.7');
    expect(keys[1]).toMatch(/^ratelimit:register:email:[0-9a-f]{64}$/);
    expect(keys.join()).not.toContain('example.com');
    expect(hitWindowWithTtl.mock.calls[0]?.[1]).toBe(REGISTRATION_DEFAULT.windowSeconds);
    expect(hitWindowWithTtl.mock.calls[1]?.[1]).toBe(REGISTRATION_EMAIL_DEFAULT.windowSeconds);
  });

  it('treats the same email the same however it is typed', async () => {
    await limiter.checkRegistration('1.1.1.1', 'Ada@Example.com');
    await limiter.checkRegistration('1.1.1.1', ' ada@example.com ');

    expect(hitWindowWithTtl.mock.calls[1]?.[0]).toBe(hitWindowWithTtl.mock.calls[3]?.[0]);
  });

  it('blocks the sixth sign-up from one IP with 429 and a clear code', async () => {
    hitWindowWithTtl.mockResolvedValueOnce({ count: REGISTRATION_DEFAULT.limit + 1, ttlSeconds: 90 });

    const attempt = limiter.checkRegistration('203.0.113.7', 'ada@example.com');

    await expect(attempt).rejects.toBeInstanceOf(HttpException);
    await expect(attempt).rejects.toMatchObject({ status: 429, response: { code: 'REGISTRATION_RATE_LIMITED' }, retryAfterSeconds: 90 });
  });

  it('blocks the fourth sign-up for one email even from a fresh IP', async () => {
    hitWindowWithTtl
      .mockResolvedValueOnce({ count: 1, ttlSeconds: 90 })
      .mockResolvedValueOnce({ count: REGISTRATION_EMAIL_DEFAULT.limit + 1, ttlSeconds: 60 });

    await expect(limiter.checkRegistration('198.51.100.1', 'ada@example.com')).rejects.toMatchObject({
      status: 429,
      response: { code: 'REGISTRATION_RATE_LIMITED' },
    });
  });

  it('limits invitation accept and preview per IP, in separate buckets', async () => {
    await limiter.checkInviteAccept('203.0.113.7');
    await limiter.checkInvitePreview('203.0.113.7');

    expect(hitWindowWithTtl.mock.calls[0]).toEqual(['ratelimit:invite-accept:203.0.113.7', INVITE_ACCEPT_DEFAULT.windowSeconds]);
    expect(hitWindowWithTtl.mock.calls[1]).toEqual(['ratelimit:invite-preview:203.0.113.7', INVITE_PREVIEW_DEFAULT.windowSeconds]);

    hitWindowWithTtl.mockResolvedValue({ count: INVITE_ACCEPT_DEFAULT.limit + 1, ttlSeconds: 5 });
    await expect(limiter.checkInviteAccept('203.0.113.7')).rejects.toMatchObject({ status: 429, response: { code: 'INVITE_RATE_LIMITED' } });
  });

  it('uses the limits set in the environment, and ignores a bad value instead of switching the limit off', async () => {
    env.REGISTRATION_LIMIT = '2';
    env.INVITE_ACCEPT_LIMIT = 'banana';
    limiter = await build();

    hitWindowWithTtl.mockResolvedValue({ count: 3, ttlSeconds: 5 });
    await expect(limiter.checkRegistration('1.1.1.1', 'ada@example.com')).rejects.toMatchObject({ status: 429 });

    hitWindowWithTtl.mockResolvedValue({ count: INVITE_ACCEPT_DEFAULT.limit, ttlSeconds: 5 });
    await expect(limiter.checkInviteAccept('1.1.1.1')).resolves.toBeUndefined();
  });

  it('skips the check (with a warning) when Redis is down: registration is also closed by default in production', async () => {
    hitWindowWithTtl.mockRejectedValue(new Error('redis down'));

    await expect(limiter.checkRegistration('1.1.1.1', 'ada@example.com')).resolves.toBeUndefined();
    await expect(limiter.checkInviteAccept('1.1.1.1')).resolves.toBeUndefined();
  });

  describe('allowInviteEmail', () => {
    it('counts one send per workspace and per recipient (the address only as a hash) and allows it', async () => {
      await expect(limiter.allowInviteEmail('org-1', 'New@Example.com')).resolves.toBe(true);

      expect(hitWindowWithTtl.mock.calls[0]).toEqual(['ratelimit:invite-email:org:org-1', INVITE_EMAIL_ORG_DEFAULT.windowSeconds]);
      expect(hitWindowWithTtl.mock.calls[1]?.[0]).toMatch(/^ratelimit:invite-email:to:[0-9a-f]{64}$/);
      expect(hitWindowWithTtl.mock.calls[1]?.[1]).toBe(INVITE_EMAIL_RECIPIENT_DEFAULT.windowSeconds);
      expect(hitWindowWithTtl.mock.calls.map((call) => call[0]).join()).not.toContain('example.com');
    });

    it('the same address in another case shares one bucket', async () => {
      await limiter.allowInviteEmail('org-1', 'a@example.com');
      await limiter.allowInviteEmail('org-2', ' A@EXAMPLE.com ');

      expect(hitWindowWithTtl.mock.calls[1]?.[0]).toBe(hitWindowWithTtl.mock.calls[3]?.[0]);
    });

    it('refuses once the recipient is over the limit, without throwing', async () => {
      hitWindowWithTtl.mockResolvedValueOnce({ count: 1, ttlSeconds: 10 }).mockResolvedValueOnce({ count: INVITE_EMAIL_RECIPIENT_DEFAULT.limit + 1, ttlSeconds: 10 });

      await expect(limiter.allowInviteEmail('org-1', 'a@example.com')).resolves.toBe(false);
    });

    it('refuses once the workspace is over the limit, before counting the recipient', async () => {
      hitWindowWithTtl.mockResolvedValueOnce({ count: INVITE_EMAIL_ORG_DEFAULT.limit + 1, ttlSeconds: 10 });

      await expect(limiter.allowInviteEmail('org-1', 'a@example.com')).resolves.toBe(false);
      expect(hitWindowWithTtl).toHaveBeenCalledTimes(1);
    });

    it('FAILS CLOSED when Redis is down: false, not an exception', async () => {
      hitWindowWithTtl.mockRejectedValue(new Error('ECONNREFUSED'));

      await expect(limiter.allowInviteEmail('org-1', 'a@example.com')).resolves.toBe(false);
    });

    it('takes limits from INVITE_EMAIL_RECIPIENT_LIMIT', async () => {
      env.INVITE_EMAIL_RECIPIENT_LIMIT = '1';
      limiter = await build();
      hitWindowWithTtl.mockResolvedValueOnce({ count: 1, ttlSeconds: 10 }).mockResolvedValueOnce({ count: 2, ttlSeconds: 10 });

      await expect(limiter.allowInviteEmail('org-1', 'a@example.com')).resolves.toBe(false);
    });
  });
});
