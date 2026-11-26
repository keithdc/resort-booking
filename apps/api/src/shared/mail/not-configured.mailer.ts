/**
 * @file apps/api/src/shared/mail/not-configured.mailer.ts
 * @shared Mail implementation used when no provider is set up (development, or an operator who sends links by hand)
 * @dependencies MailService
 */

import { MailService, type MailResult } from './mail.service';

/** Sends nothing and says so. */
export class NotConfiguredMailer extends MailService {
  public readonly enabled = false;

  public send(): Promise<MailResult> {
    return Promise.resolve({ status: 'not_configured' });
  }
}
