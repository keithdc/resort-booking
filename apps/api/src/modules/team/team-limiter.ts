/**
 * @file apps/api/src/modules/team/team-limiter.ts
 * @feature team
 * @dependencies RedisService
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { fingerprint } from '../../shared/http/client-ip';
import { enforceWindowLimit, limitSettingFromConfig, type LimitSetting } from '../../shared/redis/rate-limit';
import { RedisService } from '../../shared/redis/redis.service';

/** Registering workspaces, per IP: a handful an hour. */
export const REGISTRATION_DEFAULT: LimitSetting = { limit: 5, windowSeconds: 3600 };
/** Per email: someone trying one address again and again. */
export const REGISTRATION_EMAIL_DEFAULT: LimitSetting = { limit: 3, windowSeconds: 3600 };
/** Accepting an invitation, per IP. A real link is used once; guessing a 256-bit token cannot succeed anyway. */
export const INVITE_ACCEPT_DEFAULT: LimitSetting = { limit: 20, windowSeconds: 3600 };
/** Emails sent about invitations / access resets, per workspace: a team does not invite hundreds an hour. */
export const INVITE_EMAIL_ORG_DEFAULT: LimitSetting = { limit: 30, windowSeconds: 3600 };
/** Per recipient address (across workspaces): stops the endpoint being used to spam one person. */
export const INVITE_EMAIL_RECIPIENT_DEFAULT: LimitSetting = { limit: 4, windowSeconds: 3600 };
export const INVITE_PREVIEW_DEFAULT: LimitSetting = { limit: 60, windowSeconds: 600 };

/**
 * Abuse limits for the PUBLIC team endpoints (register, invitation preview and accept). Same behaviour as
 * the guest limiters: counted atomically in Redis, 429 with Retry-After, and if Redis is down the check is
 * skipped with a warning (registration is also closed by default in production, which is the real gate).
 * Tune with REGISTRATION_LIMIT / _WINDOW_SECONDS, REGISTRATION_EMAIL_*, INVITE_ACCEPT_*, INVITE_PREVIEW_*.
 */
@Injectable()
export class TeamLimiter {
  private readonly logger = new Logger(TeamLimiter.name);
  private readonly registration: LimitSetting;
  private readonly registrationEmail: LimitSetting;
  private readonly accept: LimitSetting;
  private readonly preview: LimitSetting;
  private readonly emailOrg: LimitSetting;
  private readonly emailRecipient: LimitSetting;
  private readonly salt: string;

  public constructor(
    private readonly redis: RedisService,
    config: ConfigService,
  ) {
    this.registration = limitSettingFromConfig(config, 'REGISTRATION', REGISTRATION_DEFAULT);
    this.registrationEmail = limitSettingFromConfig(config, 'REGISTRATION_EMAIL', REGISTRATION_EMAIL_DEFAULT);
    this.accept = limitSettingFromConfig(config, 'INVITE_ACCEPT', INVITE_ACCEPT_DEFAULT);
    this.preview = limitSettingFromConfig(config, 'INVITE_PREVIEW', INVITE_PREVIEW_DEFAULT);
    this.emailOrg = limitSettingFromConfig(config, 'INVITE_EMAIL_ORG', INVITE_EMAIL_ORG_DEFAULT);
    this.emailRecipient = limitSettingFromConfig(config, 'INVITE_EMAIL_RECIPIENT', INVITE_EMAIL_RECIPIENT_DEFAULT);
    this.salt = config.get<string>('IP_HASH_SALT') ?? '';
  }

  public async checkRegistration(ip: string | undefined, email: string): Promise<void> {
    await enforceWindowLimit(this.redis, this.logger, {
      keyPrefix: 'ratelimit:register:ip:',
      callerId: ip,
      ...this.registration,
      code: 'REGISTRATION_RATE_LIMITED',
      message: 'Too many sign-up attempts from this network. Please try again later.',
    });
    await enforceWindowLimit(this.redis, this.logger, {
      keyPrefix: 'ratelimit:register:email:',
      callerId: fingerprint(email, this.salt),
      ...this.registrationEmail,
      code: 'REGISTRATION_RATE_LIMITED',
      message: 'Too many sign-up attempts for this email. Please try again later.',
    });
  }

  public async checkInviteAccept(ip: string | undefined): Promise<void> {
    await enforceWindowLimit(this.redis, this.logger, {
      keyPrefix: 'ratelimit:invite-accept:',
      callerId: ip,
      ...this.accept,
      code: 'INVITE_RATE_LIMITED',
      message: 'Too many attempts. Please try again later.',
    });
  }

  public async checkInvitePreview(ip: string | undefined): Promise<void> {
    await enforceWindowLimit(this.redis, this.logger, {
      keyPrefix: 'ratelimit:invite-preview:',
      callerId: ip,
      ...this.preview,
      code: 'INVITE_RATE_LIMITED',
      message: 'Too many attempts. Please try again later.',
    });
  }

  /**
   * May an invitation / reset email go out now? Counts one send against the workspace and against the
   * recipient (only a hash of the address is kept). Unlike the other checks this FAILS CLOSED and never throws:
   * over the limit, or Redis down, answers false and the caller reports emailStatus "failed" (the invite itself
   * is already created, and the admin can still copy the link).
   * Tune with INVITE_EMAIL_ORG_LIMIT / _WINDOW_SECONDS and INVITE_EMAIL_RECIPIENT_LIMIT / _WINDOW_SECONDS.
   */
  public async allowInviteEmail(organizationId: string, recipientEmail: string): Promise<boolean> {
    try {
      const org = await this.redis.hitWindowWithTtl(`ratelimit:invite-email:org:${organizationId}`, this.emailOrg.windowSeconds);
      if (org.count > this.emailOrg.limit) {
        this.logger.warn('Invite email refused: workspace limit reached');
        return false;
      }
      const recipient = await this.redis.hitWindowWithTtl(
        `ratelimit:invite-email:to:${fingerprint(recipientEmail, this.salt)}`,
        this.emailRecipient.windowSeconds,
      );
      if (recipient.count > this.emailRecipient.limit) {
        this.logger.warn('Invite email refused: recipient limit reached');
        return false;
      }
      return true;
    } catch {
      this.logger.warn('Invite email refused: rate limiter unavailable (Redis)');
      return false;
    }
  }
}
