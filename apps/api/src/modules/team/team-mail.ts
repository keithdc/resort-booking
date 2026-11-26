/**
 * @file apps/api/src/modules/team/team-mail.ts
 * @feature team
 * @dependencies staff-role
 * The invitation / access-reset email: subject, plain text and plain HTML. Pure functions. EVERY interpolated
 * value is escaped for HTML (a name like `<img onerror=...>` must stay text) and stripped of line breaks in the
 * subject (no header injection). The link carries the one-time token, so it must never be logged.
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

/** The admin site's address for a one-time link: `${base}/invite/${token}` (the admin route /invite/[token]). */
export function inviteLink(baseUrl: string, token: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/invite/${encodeURIComponent(token)}`;
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

export function renderInviteMail(input: InviteMailInput): RenderedMail {
  const organization = oneLine(input.organizationName);
  const inviter = oneLine(input.inviterName);
  const recipient = oneLine(input.recipientName);
  const expiry = formatExpiry(input.expiresAt);
  const subject = input.isReset ? `Reset your access to ${organization}` : `${inviter} invited you to ${organization}`;
  const intro = input.isReset
    ? `${inviter} reset your access to ${organization}. You were signed out everywhere. Use the link below to choose a new password.`
    : `${inviter} invited you to join ${organization} as ${ROLE_WORDS[input.role]}.`;
  const action = input.isReset ? 'Choose a new password' : 'Accept the invitation';
  const note = `The link works once and expires ${expiry}.`;
  const ignore = 'If you did not expect this, you can ignore this email: nothing happens until the link is used.';

  const text = [`Hello ${recipient},`, '', intro, '', `${action}: ${input.link}`, '', note, ignore, ''].join('\n');
  const html = [
    '<!doctype html>',
    '<html><body style="margin:0;padding:24px;background:#f5f5f5;font-family:Arial,Helvetica,sans-serif;color:#1a1a1a;">',
    '<div style="max-width:520px;margin:0 auto;background:#ffffff;padding:24px;border-radius:8px;">',
    `<p style="margin:0 0 16px;">Hello ${escapeHtml(recipient)},</p>`,
    `<p style="margin:0 0 16px;">${escapeHtml(intro)}</p>`,
    `<p style="margin:0 0 16px;"><a href="${escapeHtml(input.link)}" style="display:inline-block;padding:10px 18px;background:#1565c0;color:#ffffff;text-decoration:none;border-radius:6px;">${escapeHtml(action)}</a></p>`,
    `<p style="margin:0 0 16px;font-size:13px;color:#555555;">Or paste this address into your browser:<br>${escapeHtml(input.link)}</p>`,
    `<p style="margin:0 0 8px;font-size:13px;color:#555555;">${escapeHtml(note)}</p>`,
    `<p style="margin:0;font-size:13px;color:#555555;">${escapeHtml(ignore)}</p>`,
    '</div>',
    '</body></html>',
  ].join('\n');
  return { subject, html, text };
}
