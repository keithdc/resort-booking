/**
 * @file apps/api/src/shared/mail/mail.module.ts
 * @shared Provides MailService: Resend when configured, otherwise the "not configured" no-op
 * @dependencies ConfigService, ResendMailer, NotConfiguredMailer
 */

import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { readMailSettings } from './mail.config';
import { MailService } from './mail.service';
import { NotConfiguredMailer } from './not-configured.mailer';
import { ResendMailer } from './resend.mailer';

/** Chooses the implementation from the environment. */
export function createMailService(config: ConfigService): MailService {
  const settings = readMailSettings({ RESEND_API_KEY: config.get<string>('RESEND_API_KEY'), MAIL_FROM: config.get<string>('MAIL_FROM') });
  return settings === null ? new NotConfiguredMailer() : new ResendMailer(settings);
}

@Global()
@Module({
  providers: [{ provide: MailService, inject: [ConfigService], useFactory: createMailService }],
  exports: [MailService],
})
export class MailModule {}
