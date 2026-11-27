/**
 * @file apps/api/src/modules/team/team-mail.ts
 * @feature team
 * @dependencies staff-role
 * The invitation / access-reset email: subject, plain text and plain HTML. Pure functions. EVERY interpolated
 * value is escaped for HTML (a name like `<img onerror=...>` must stay text). The link carries the one-time token, so it
 * must never be logged.
 *
 * Anti-phishing shape (docs/13 R2-25): the mail goes out from our verified domain to any address, and the workspace name,
 * the sender's name and the recipient's name are typed by whoever has a workspace. So the subject is FIXED wording (no
 * free text, no header injection), the greeting uses no typed name, and the typed values appear only inside quotes under
 * a line that says they were entered by the sender and are not verified. They are cut short and anything that looks
 * like a web address or email address is removed, so they cannot carry a second link or a call to action.
 */

import type { StaffRole } from '../../shared/roles/staff-role';

export interface InviteMailInput {
  recipientName: string;
  inviterName: string;
  organizationName: string;
  role: StaffRole;
  /** Full one-time link. */
  link: string;
  expiresAt: Date;
  /** True for an access reset of an existing member, false for a first invitation. */
  isReset: boolean;
}

export interface RenderedMail {
  subject: string;
  html: string;
  text: string;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;
const ROLE_WORDS: Record<StaffRole, string> = { admin: 'an administrator', employee: 'an employee' };

/**
 * The admin site's address for a one-time link: `${base}/invite#token=${token}`. The token sits after the `#`, the
 * fragment: a browser never sends it to a server, so it is not in an access log, a proxy log or a Referer header.
 */
export function inviteLink(baseUrl: string, token: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/invite#token=${encodeURIComponent(token)}`;
}

/** Escapes text for HTML content and double-quoted attributes. */
export function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** Fixed, locale-independent UTC wording, e.g. "29 Nov 2026, 12:00 UTC". */
export function formatExpiry(date: Date): string {
  const two = (n: number): string => String(n).padStart(2, '0');
  return `${String(date.getUTCDate())} ${MONTHS[date.getUTCMonth()] ?? ''} ${String(date.getUTCFullYear())}, ${two(date.getUTCHours())}:${two(date.getUTCMinutes())} UTC`;
}

function oneLine(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

/** The longest typed value shown in a mail. A workspace or person name is shorter than this. */
export const MAIL_FREE_TEXT_MAX = 60;

const WEB_ADDRESS = /\b(?:https?:\/\/|www\.)\S*/gi;
const EMAIL_ADDRESS = /\S+@\S+/g;
const DOMAIN_LIKE = /\b[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)*\.(?:[a-z]{2,24})\b\S*/giu;

/** Control characters and the characters that hide text or make it read backwards (zero width, bidirectional overrides). */
function isInvisible(codePoint: number): boolean {
  return (
    codePoint <= 0x1f ||
    (codePoint >= 0x7f && codePoint <= 0x9f) ||
    (codePoint >= 0x200b && codePoint <= 0x200f) ||
    (codePoint >= 0x202a && codePoint <= 0x202e) ||
    (codePoint >= 0x2066 && codePoint <= 0x2069) ||
    codePoint === 0xfeff
  );
}

function stripInvisible(value: string): string {
  return Array.from(value, (char): string => (isInvisible(char.codePointAt(0) ?? 0) ? ' ' : char)).join('');
}

/**
 * A typed value made safe to show as quoted data: invisible and direction-changing characters dropped, one line, no web or
 * email address, no domain name, at most MAIL_FREE_TEXT_MAX characters. What remains is plain words.
 */
export function plainLabel(value: string): string {
  const cleaned = oneLine(stripInvisible(value).replace(WEB_ADDRESS, ' ').replace(EMAIL_ADDRESS, ' ').replace(DOMAIN_LIKE, ' '));
  const cut = cleaned.length > MAIL_FREE_TEXT_MAX ? `${cleaned.slice(0, MAIL_FREE_TEXT_MAX - 1).trimEnd()}…` : cleaned;
  return cut === '' ? '(not given)' : cut;
}

/** Subject and body for an invitation or an access reset, with typed values quoted and labelled as unverified. */
export function renderInviteMail(input: InviteMailInput): RenderedMail {
  const organization = plainLabel(input.organizationName);
  const inviter = plainLabel(input.inviterName);
  const expiry = formatExpiry(input.expiresAt);
  const subject = input.isReset ? 'Reset your access to your workspace' : 'You have been invited to join a workspace';
  const intro = input.isReset
    ? 'An administrator reset your access to a workspace on this booking system. You were signed out everywhere. Use the link below to choose a new password.'
    : 'Someone with an account on this booking system invited you to join a workspace.';
  const unverified = 'The details below were typed by the sender. We have not verified them:';
  const details = [
    `Workspace: "${organization}"`,
    `${input.isReset ? 'Reset by' : 'Invited by'}: "${inviter}"`,
    `Role: ${ROLE_WORDS[input.role]}`,
  ];
  const action = input.isReset ? 'Choose a new password' : 'Accept the invitation';
  const note = `The link works once and expires ${expiry}.`;
  const ignore = 'If you did not expect this, you can ignore this email: nothing happens until the link is used.';
  const safety = 'We never ask for your password or a code by email or phone. This message comes from the booking system, not from the workspace or the person named above.';

  const text = ['Hello,', '', intro, '', unverified, ...details.map((line): string => `  ${line}`), '', `${action}: ${input.link}`, '', note, ignore, safety, ''].join('\n');
  const html = [
    '<!doctype html>',
    '<html><body style="margin:0;padding:24px;background:#f5f5f5;font-family:Arial,Helvetica,sans-serif;color:#1a1a1a;">',
    '<div style="max-width:520px;margin:0 auto;background:#ffffff;padding:24px;border-radius:8px;">',
    '<p style="margin:0 0 16px;">Hello,</p>',
    `<p style="margin:0 0 16px;">${escapeHtml(intro)}</p>`,
    `<p style="margin:0 0 4px;font-size:13px;color:#555555;">${escapeHtml(unverified)}</p>`,
    `<ul style="margin:0 0 16px;padding-left:20px;font-size:14px;">${details.map((line): string => `<li>${escapeHtml(line)}</li>`).join('')}</ul>`,
    `<p style="margin:0 0 16px;"><a href="${escapeHtml(input.link)}" style="display:inline-block;padding:10px 18px;background:#1565c0;color:#ffffff;text-decoration:none;border-radius:6px;">${escapeHtml(action)}</a></p>`,
    `<p style="margin:0 0 16px;font-size:13px;color:#555555;">Or paste this address into your browser:<br>${escapeHtml(input.link)}</p>`,
    `<p style="margin:0 0 8px;font-size:13px;color:#555555;">${escapeHtml(note)}</p>`,
    `<p style="margin:0 0 8px;font-size:13px;color:#555555;">${escapeHtml(ignore)}</p>`,
    `<p style="margin:0;font-size:13px;color:#555555;">${escapeHtml(safety)}</p>`,
    '</div>',
    '</body></html>',
  ].join('\n');
  return { subject, html, text };
}
