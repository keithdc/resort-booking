/**
 * @file apps/api/src/shared/mail/mail.config.spec.ts
 * @shared Mail settings parsing, validation and module wiring
 */

import { ConfigService } from '@nestjs/config';
import { mailEnvironmentProblems, parseAdminAppUrl, readMailSettings } from './mail.config';
import { createMailService } from './mail.module';
import { NotConfiguredMailer } from './not-configured.mailer';
import { ResendMailer } from './resend.mailer';

const GOOD = { RESEND_API_KEY: 're_x', MAIL_FROM: 'Humphreys <staff@example.com>', ADMIN_APP_URL: 'https://admin.example.com' };

describe('readMailSettings', () => {
  it('needs both a key and a well-formed sender', () => {
    expect(readMailSettings(GOOD)).toEqual({ apiKey: 're_x', from: 'Humphreys <staff@example.com>' });
    expect(readMailSettings({ ...GOOD, MAIL_FROM: 'staff@example.com' })).not.toBeNull();
    expect(readMailSettings({ ...GOOD, RESEND_API_KEY: ' ' })).toBeNull();
    expect(readMailSettings({ ...GOOD, MAIL_FROM: undefined })).toBeNull();
    expect(readMailSettings({ ...GOOD, MAIL_FROM: 'nonsense' })).toBeNull();
    expect(readMailSettings({ ...GOOD, MAIL_FROM: 'a <b@example.com>\r\nBcc: x@example.com' })).toBeNull();
  });
});

describe('parseAdminAppUrl', () => {
  it('accepts http(s) URLs and drops the trailing slash', () => {
    expect(parseAdminAppUrl('http://localhost:3001')).toBe('http://localhost:3001');
    expect(parseAdminAppUrl(' https://admin.example.com/ ')).toBe('https://admin.example.com');
    expect(parseAdminAppUrl('https://example.com/staff/')).toBe('https://example.com/staff');
  });

  it.each([undefined, '', 'admin.example.com', 'ftp://example.com', 'javascript:alert(1)', 'https://u:p@example.com', 'https://example.com/?a=1', 'https://example.com/#x'])(
    'rejects %p',
    (value) => {
      expect(parseAdminAppUrl(value)).toBeNull();
    },
  );
});

describe('mailEnvironmentProblems', () => {
  it('is silent when mail is off and no URL is set', () => {
    expect(mailEnvironmentProblems({}, true)).toEqual({ errors: [], warnings: [] });
  });

  it('only warns about a broken ADMIN_APP_URL when mail is off', () => {
    const result = mailEnvironmentProblems({ ADMIN_APP_URL: 'nope' }, true);

    expect(result.errors).toEqual([]);
    expect(result.warnings).toHaveLength(1);
  });

  it('passes a full configuration', () => {
    expect(mailEnvironmentProblems(GOOD, true)).toEqual({ errors: [], warnings: [] });
    expect(mailEnvironmentProblems({ ...GOOD, ADMIN_APP_URL: 'http://localhost:3001' }, false).errors).toEqual([]);
  });

  it('requires MAIL_FROM and ADMIN_APP_URL once a key is set', () => {
    expect(mailEnvironmentProblems({ RESEND_API_KEY: 're_x' }, false).errors).toHaveLength(2);
    expect(mailEnvironmentProblems({ ...GOOD, MAIL_FROM: '' }, false).errors.join(' ')).toContain('MAIL_FROM');
    expect(mailEnvironmentProblems({ ...GOOD, ADMIN_APP_URL: 'ftp://x' }, false).errors.join(' ')).toContain('ADMIN_APP_URL');
  });

  it('requires https in production only', () => {
    const http = { ...GOOD, ADMIN_APP_URL: 'http://admin.example.com' };

    expect(mailEnvironmentProblems(http, true).errors.join(' ')).toContain('https');
    expect(mailEnvironmentProblems(http, false).errors).toEqual([]);
  });

  it('never repeats the key or the address in a message', () => {
    const result = mailEnvironmentProblems({ RESEND_API_KEY: 're_secret_value', MAIL_FROM: 'bad', ADMIN_APP_URL: 'ftp://secret.example.com' }, true);

    expect(JSON.stringify(result)).not.toContain('re_secret_value');
    expect(JSON.stringify(result)).not.toContain('secret.example.com');
  });
});

describe('createMailService', () => {
  const config = (env: Record<string, string>): ConfigService => ({ get: (name: string): string | undefined => env[name] }) as unknown as ConfigService;

  it('is Resend only with a key and a sender', () => {
    const real = createMailService(config(GOOD));
    expect(real).toBeInstanceOf(ResendMailer);
    expect(real.enabled).toBe(true);
  });

  it('is the no-op without a key (or with a bad sender), and answers not_configured', async () => {
    for (const env of [{}, { ...GOOD, RESEND_API_KEY: '' }, { ...GOOD, MAIL_FROM: 'bad' }]) {
      const mailer = createMailService(config(env));
      expect(mailer).toBeInstanceOf(NotConfiguredMailer);
      expect(mailer.enabled).toBe(false);
      await expect(mailer.send({ to: 'a@example.com', subject: 's', html: 'h', text: 't' })).resolves.toEqual({ status: 'not_configured' });
    }
  });
});
