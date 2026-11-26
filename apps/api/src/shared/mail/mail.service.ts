/**
 * @file apps/api/src/shared/mail/mail.service.ts
 * @shared Provider-agnostic outbound email contract
 * @dependencies none
 */

/** One email to one recipient. Both bodies are final: the caller has already escaped what goes in the HTML. */
export interface MailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** Our own request id, only used to correlate a log line with the request. Never sent as content. */
  requestId?: string | undefined;
}

/**
 * What happened. `errorClass` is a short, fixed-vocabulary label (e.g. "http_422", "timeout", "network"),
 * never the provider's message (which can echo an address) and never a secret.
 */
export type MailResult =
  | { status: 'sent'; providerId: string | null }
  | { status: 'failed'; errorClass: string }
  | { status: 'not_configured' };

/**
 * Sends email. Implementations must NEVER throw: a mail problem is a result, not an exception, so a feature
 * that sends mail can finish its real work whatever the provider does. Abstract class so Nest can inject it.
 */
export abstract class MailService {
  /** True when a real provider is configured, so a screen can offer "email it". */
  public abstract readonly enabled: boolean;

  public abstract send(message: MailMessage): Promise<MailResult>;
}
