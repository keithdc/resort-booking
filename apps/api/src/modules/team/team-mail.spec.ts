/**
 * @file apps/api/src/modules/team/team-mail.spec.ts
 * @feature team
 */

import { escapeHtml, formatExpiry, inviteLink, MAIL_FREE_TEXT_MAX, plainLabel, renderInviteMail, type InviteMailInput } from './team-mail';

const BASE: InviteMailInput = {
  recipientName: 'Lena Roche',
  inviterName: 'Ada Lovelace',
  organizationName: 'Humphreys',
  role: 'employee',
  link: 'https://admin.example.com/invite#token=abc123',
  expiresAt: new Date('2026-11-29T12:05:00.000Z'),
  isReset: false,
};

describe('inviteLink', () => {
  it('puts the token after the # (never sent to a server) and ignores a trailing slash', () => {
    expect(inviteLink('https://admin.example.com', 'tok')).toBe('https://admin.example.com/invite#token=tok');
    expect(inviteLink('http://localhost:3001/', 'tok')).toBe('http://localhost:3001/invite#token=tok');
    expect(new URL(inviteLink('https://admin.example.com', 'tok')).pathname).toBe('/invite');
  });
});

describe('formatExpiry', () => {
  it('uses fixed UTC wording', () => {
    expect(formatExpiry(new Date('2026-11-29T12:05:00.000Z'))).toBe('29 Nov 2026, 12:05 UTC');
    expect(formatExpiry(new Date('2026-01-02T03:04:00.000Z'))).toBe('2 Jan 2026, 03:04 UTC');
  });
});

describe('renderInviteMail', () => {
  it('an invitation has fixed wording in the subject and quotes the typed names as unverified details, with link, expiry and the ignore line', () => {
    const mail = renderInviteMail(BASE);

    expect(mail.subject).toBe('You have been invited to join a workspace');
    expect(mail.text).toContain('Workspace: "Humphreys"');
    expect(mail.html).toContain('Workspace: &quot;Humphreys&quot;');
    expect(mail.text).toContain('Invited by: "Ada Lovelace"');
    expect(mail.html).toContain('Invited by: &quot;Ada Lovelace&quot;');
    for (const body of [mail.text, mail.html]) {
      expect(body).toContain('typed by the sender');
      expect(body).toContain('Role: an employee');
      expect(body).toContain('https://admin.example.com/invite#token=abc123');
      expect(body).toContain('expires 29 Nov 2026, 12:05 UTC');
      expect(body).toContain('If you did not expect this, you can ignore this email');
      expect(body).toContain('We never ask for your password or a code by email or phone');
    }
    expect(mail.html).toContain('href="https://admin.example.com/invite#token=abc123"');
  });

  it('says administrator for an admin', () => {
    expect(renderInviteMail({ ...BASE, role: 'admin' }).text).toContain('Role: an administrator');
  });

  it('an access reset says so and asks for a new password', () => {
    const mail = renderInviteMail({ ...BASE, isReset: true });

    expect(mail.subject).toBe('Reset your access to your workspace');
    expect(mail.text).toContain('reset your access');
    expect(mail.text).toContain('Choose a new password');
    expect(mail.text).toContain('Reset by: "Ada Lovelace"');
  });

  it('the subject and the greeting never contain a typed name (no branded subject line for an attacker)', () => {
    const mail = renderInviteMail({ ...BASE, recipientName: 'Your bank', inviterName: 'Security Team', organizationName: 'Urgent: verify your account' });

    expect(mail.subject).not.toMatch(/bank|security|urgent|verify/i);
    expect(mail.text.startsWith('Hello,\n')).toBe(true);
    expect(mail.text).not.toContain('Your bank');
    expect(mail.html).not.toContain('Your bank');
  });

  it('escapes every interpolated value in the HTML so a name cannot inject markup', () => {
    const evil = '<img src=x onerror=alert(1)>"\'&';
    const mail = renderInviteMail({ ...BASE, inviterName: evil, organizationName: evil, link: 'https://a.example/invite/x"><script>alert(1)</script>' });

    expect(mail.html).not.toContain('<img');
    expect(mail.html).not.toContain('<script>');
    expect(mail.html).toContain('&lt;img src=x onerror=alert(1)&gt;&quot;&#39;&amp;');
    expect(mail.html).toContain('x&quot;&gt;&lt;script&gt;');
  });

  it('a typed name cannot carry a second link, an email address or a domain', () => {
    const mail = renderInviteMail({
      ...BASE,
      organizationName: 'Pay now at https://evil.example/pay or www.evil.example',
      inviterName: 'help@evil.example call +33 6 12 34 56 78 or visit bank-login.com/reset',
    });

    for (const body of [mail.text, mail.html]) {
      expect(body).not.toContain('evil.example');
      expect(body).not.toContain('bank-login');
      expect(body).not.toContain('help@');
    }
    expect(mail.text).toContain('Pay now at');
  });

  it('keeps line breaks out of the subject (no header injection), whatever the names hold', () => {
    const mail = renderInviteMail({ ...BASE, inviterName: 'Ada\r\nBcc: evil@example.com', organizationName: 'Org\nX' });

    expect(mail.subject).not.toMatch(/[\r\n]/);
    expect(mail.text).not.toContain('evil@example.com');
  });
});

describe('plainLabel', () => {
  it('keeps ordinary names, including accents, apostrophes, abbreviations and numbers', () => {
    expect(plainLabel('Humphreys')).toBe('Humphreys');
    expect(plainLabel("Chalets d'Élodie & Fils No. 5")).toBe("Chalets d'Élodie & Fils No. 5");
    expect(plainLabel('St. Peter Resorts Ltd.')).toBe('St. Peter Resorts Ltd.');
  });

  it('collapses whitespace and line breaks into one line', () => {
    expect(plainLabel('  Ada \n\t Lovelace  ')).toBe('Ada Lovelace');
  });

  it('drops zero-width and direction-changing characters', () => {
    expect(plainLabel('Hum\u200bphreys\u202eevil')).toBe('Hum phreys evil');
  });

  it('removes web addresses, email addresses and domain names', () => {
    expect(plainLabel('see https://evil.example/x?y=1 now')).toBe('see now');
    expect(plainLabel('a@b.example')).toBe('(not given)');
    expect(plainLabel('Visit Bank-Login.COM now')).toBe('Visit now');
  });

  it(`cuts to ${String(MAIL_FREE_TEXT_MAX)} characters with an ellipsis`, () => {
    const cut = plainLabel('x'.repeat(500));

    expect(cut).toHaveLength(MAIL_FREE_TEXT_MAX);
    expect(cut.endsWith('…')).toBe(true);
  });

  it('says "(not given)" for nothing at all', () => {
    expect(plainLabel('')).toBe('(not given)');
    expect(plainLabel(' \n ')).toBe('(not given)');
  });
});

describe('escapeHtml', () => {
  it('escapes the five special characters', () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;');
  });
});
