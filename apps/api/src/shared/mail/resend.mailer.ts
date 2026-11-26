/**
 * @file apps/api/src/shared/mail/resend.mailer.ts
 * @shared Resend implementation of MailService (global fetch, no SDK)
 * @dependencies MailService
 * One POST per message, 5 second timeout, NO retries (a retry after a timeout could deliver twice). Never throws.
 * Logs only the outcome, the provider's error class and our request id: never the API key, the address, the
 * subject or the body (an invitation body holds a one-time link).
 */

import { Logger } from '@nestjs/common';
import { MailService, type MailMessage, type MailResult } from './mail.service';

export const RESEND_ENDPOINT = 'https://api.resend.com/emails';
export const RESEND_TIMEOUT_MS = 5000;

export interface ResendMailerOptions {
  apiKey: string;
  /** The From header, e.g. `Humphreys <staff@example.com>`. */
  from: string;
  /** For tests. Defaults to the global fetch. */
  fetchFn?: typeof fetch;
  timeoutMs?: number;
}

export class ResendMailer extends MailService {
  public readonly enabled = true;
  private readonly logger = new Logger('Mail');
  private readonly fetchFn: typeof fetch;
  private readonly timeoutMs: number;

  public constructor(private readonly options: ResendMailerOptions) {
    super();
    this.fetchFn = options.fetchFn ?? fetch;
    this.timeoutMs = options.timeoutMs ?? RESEND_TIMEOUT_MS;
  }

  public async send(message: MailMessage): Promise<MailResult> {
    const req = message.requestId ?? 'none';
    try {
      const response = await this.fetchFn(RESEND_ENDPOINT, {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.options.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: this.options.from, to: [message.to], subject: message.subject, html: message.html, text: message.text }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      if (!response.ok) {
        const errorClass = await providerErrorClass(response);
        this.logger.warn(`resend failed class=${errorClass} req=${req}`);
        return { status: 'failed', errorClass };
      }
      const providerId = await providerMessageId(response);
      this.logger.log(`resend sent id=${providerId ?? 'none'} req=${req}`);
      return { status: 'sent', providerId };
    } catch (error: unknown) {
      const errorClass = isTimeout(error) ? 'timeout' : 'network';
      this.logger.warn(`resend failed class=${errorClass} req=${req}`);
      return { status: 'failed', errorClass };
    }
  }
}

function isTimeout(error: unknown): boolean {
  // Duck-typed: a DOMException is not always `instanceof Error` (other realms, test sandboxes).
  const name = typeof error === 'object' && error !== null ? (error as { name?: unknown }).name : undefined;
  return name === 'TimeoutError' || name === 'AbortError';
}

/** "http_<status>", plus Resend's error name when it is a plain identifier (e.g. http_422_validation_error). */
async function providerErrorClass(response: Response): Promise<string> {
  const base = `http_${String(response.status)}`;
  try {
    const body: unknown = await response.json();
    const name = typeof body === 'object' && body !== null ? (body as { name?: unknown }).name : undefined;
    return typeof name === 'string' && /^[a-z_]{1,40}$/.test(name) ? `${base}_${name}` : base;
  } catch {
    return base;
  }
}

async function providerMessageId(response: Response): Promise<string | null> {
  try {
    const body: unknown = await response.json();
    const id = typeof body === 'object' && body !== null ? (body as { id?: unknown }).id : undefined;
    return typeof id === 'string' && /^[A-Za-z0-9-]{1,64}$/.test(id) ? id : null;
  } catch {
    return null;
  }
}
