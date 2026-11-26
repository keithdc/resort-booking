/**
 * @file apps/api/src/modules/team/team-mail.spec.ts
 * @feature team
 */

import { escapeHtml, formatExpiry, inviteLink, renderInviteMail, type InviteMailInput } from './team-mail';

const BASE: InviteMailInput = {
  recipientName: 'Lena Roche',
  inviterName: 'Ada Lovelace',
  organizationName: 'Humphreys',
  role: 'employee',
  link: 'https://admin.example.com/invite/abc123',
  expiresAt: new Date('2026-11-29T12:05:00.000Z'),
  isReset: false,
};

describe('inviteLink', () => {
  it('matches the admin route /invite/[token] and ignores a trailing slash', () => {
    expect(inviteLink('https://admin.example.com', 'tok')).toBe('https://admin.example.com/invite/tok');
    expect(inviteLink('http://localhost:3001/', 'tok')).toBe('http://localhost:3001/invite/tok');
  });
});

describe('formatExpiry', () => {
  it('uses fixed UTC wording', () => {
    expect(formatExpiry(new Date('2026-11-29T12:05:00.000Z'))).toBe('29 Nov 2026, 12:05 UTC');
    expect(formatExpiry(new Date('2026-01-02T03:04:00.000Z'))).toBe('2 Jan 2026, 03:04 UTC');
  });
});

describe('renderInviteMail', () => {
  it('an invitation names the inviter, workspace and role, and has the link, expiry and the ignore line in both bodies', () => {
    const mail = renderInviteMail(BASE);

    expect(mail.subject).toBe('Ada Lovelace invited you to Humphreys');
    for (const body of [mail.text, mail.html]) {
      expect(body).toContain('Ada Lovelace');
      expect(body).toContain('Humphreys');
      expect(body).toContain('an employee');
      expect(body).toContain('https://admin.example.com/invite/abc123');
      expect(body).toContain('expires 29 Nov 2026, 12:05 UTC');
      expect(body).toContain('If you did not expect this, you can ignore this email');
    }
    expect(mail.html).toContain('href="https://admin.example.com/invite/abc123"');
  });

  it('says administrator for an admin', () => {
    expect(renderInviteMail({ ...BASE, role: 'admin' }).text).toContain('an administrator');
  });

  it('an access reset says so and asks for a new password', () => {
    const mail = renderInviteMail({ ...BASE, isReset: true });

    expect(mail.subject).toBe('Reset your access to Humphreys');
    expect(mail.text).toContain('reset your access');
    expect(mail.text).toContain('Choose a new password');
  });

  it('escapes every interpolated value in the HTML so a name cannot inject markup', () => {
    const evil = '<img src=x onerror=alert(1)>"\'&';
    const mail = renderInviteMail({ ...BASE, recipientName: evil, inviterName: evil, organizationName: evil, link: 'https://a.example/invite/x"><script>alert(1)</script>' });

    expect(mail.html).not.toContain('<img');
    expect(mail.html).not.toContain('<script>');
    expect(mail.html).toContain('&lt;img src=x onerror=alert(1)&gt;&quot;&#39;&amp;');
    expect(mail.html).toContain('x&quot;&gt;&lt;script&gt;');
  });

  it('keeps line breaks out of the subject (no header injection)', () => {
    const mail = renderInviteMail({ ...BASE, inviterName: 'Ada\r\nBcc: evil@example.com', organizationName: 'Org\nX' });

    expect(mail.subject).not.toMatch(/[\r\n]/);
  });
});

describe('escapeHtml', () => {
  it('escapes the five special characters', () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;');
  });
});
