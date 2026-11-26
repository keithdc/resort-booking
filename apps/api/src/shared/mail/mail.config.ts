/**
 * @file apps/api/src/shared/mail/mail.config.ts
 * @shared Reads and validates the mail settings (RESEND_API_KEY, MAIL_FROM, ADMIN_APP_URL)
 * @dependencies none
 * Mail is ON only when RESEND_API_KEY is set. Without it the product still works: the admin copies the link.
 */

type Env = Readonly<Record<string, string | undefined>>;

export interface MailSettings {
  apiKey: string;
  from: string;
}

const MAILBOX = /^([^<>\r\n"]*<[^<>\s@\r\n]+@[^<>\s@\r\n]+\.[^<>\s@\r\n]+>|[^<>\s@\r\n]+@[^<>\s@\r\n]+\.[^<>\s@\r\n]+)$/;

/** The key and sender when mail is fully configured, else null. Never throws. */
export function readMailSettings(env: Env): MailSettings | null {
  const apiKey = env.RESEND_API_KEY?.trim() ?? '';
  const from = env.MAIL_FROM?.trim() ?? '';
  return apiKey !== '' && MAILBOX.test(from) ? { apiKey, from } : null;
}

/**
 * Base URL of the admin app for links in emails: a http(s) URL with no credentials, query or fragment, without
 * a trailing slash. Null when missing or not usable.
 */
export function parseAdminAppUrl(raw: string | undefined): string | null {
  const value = raw?.trim() ?? '';
  if (value === '') {
    return null;
  }
  try {
    const url = new URL(value);
    if ((url.protocol !== 'http:' && url.protocol !== 'https:') || url.username !== '' || url.password !== '' || url.search !== '' || url.hash !== '') {
      return null;
    }
    return `${url.origin}${url.pathname}`.replace(/\/+$/, '');
  } catch {
    return null;
  }
}

/**
 * Startup findings for the mail settings. Errors (in any environment, because the settings are wrong everywhere):
 * a key without a usable MAIL_FROM or ADMIN_APP_URL, and, in production, an ADMIN_APP_URL that is not https.
 * No key means mail is off and there is nothing to check beyond a warning for a broken ADMIN_APP_URL.
 * Never repeats a value in a message.
 */
export function mailEnvironmentProblems(env: Env, production: boolean): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  const appUrl = parseAdminAppUrl(env.ADMIN_APP_URL);
  if ((env.RESEND_API_KEY?.trim() ?? '') === '') {
    if ((env.ADMIN_APP_URL?.trim() ?? '') !== '' && appUrl === null) {
      warnings.push('ADMIN_APP_URL is not a valid http(s) URL (no credentials, query or fragment).');
    }
    return { errors, warnings };
  }
  if (!MAILBOX.test(env.MAIL_FROM?.trim() ?? '')) {
    errors.push('MAIL_FROM is missing or malformed: RESEND_API_KEY is set, so use e.g. "Humphreys <staff@your-domain>".');
  }
  if (appUrl === null) {
    errors.push('ADMIN_APP_URL is missing or not a valid http(s) URL: RESEND_API_KEY is set, so emails need the admin site address for their links.');
  } else if (production && !appUrl.startsWith('https://')) {
    errors.push('ADMIN_APP_URL must be https in production.');
  }
  return { errors, warnings };
}
