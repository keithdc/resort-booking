# Email (Resend)

The API can email staff invitation and access-reset links through [Resend](https://resend.com). It is optional: the admin can always **copy the one-time link and send it themselves**.

## What it does

- Team > Invite someone, "Email new link" on a pending invitation, and "Reset access" on a member each offer **Email the link to them**. The link is always shown in the admin app too (with a Copy button), whatever happens to the email.
- The invitation or reset is created FIRST, then the email is attempted. A mail problem never fails the invite: the response carries `emailStatus` (`sent`, `failed`, `not_configured`; absent when the admin did not ask for an email) and the screen says what happened.
- The email is plain HTML plus text. Every value (names, workspace) is HTML-escaped. The link is `${ADMIN_APP_URL}/invite#token=${token}` (the token after the `#`, so no server or Referer header ever sees it; docs/13 R6-03), works once, and the email says when it expires and "if you did not expect this, ignore it".
- Code: `apps/api/src/shared/mail/` (provider-agnostic `MailService`, `ResendMailer`, a no-op `NotConfiguredMailer`) and `apps/api/src/modules/team/team-mail.ts` (templates).

## Settings (`apps/api/.env`)

| Variable | Notes |
| --- | --- |
| `RESEND_API_KEY` | Optional. Mail is ON only when it is set. A sending-only key. Never commit it. |
| `MAIL_FROM` | Required with the key. e.g. `Humphreys <staff@your-domain>`, on a verified domain. |
| `ADMIN_APP_URL` | Required with the key. Base address of the admin site, e.g. `http://localhost:3001`. http(s) only; **https in production**. |
| `INVITE_EMAIL_ORG_LIMIT` / `_WINDOW_SECONDS` | Emails per workspace (default 30 per hour). |
| `INVITE_EMAIL_RECIPIENT_LIMIT` / `_WINDOW_SECONDS` | Emails per recipient address (default 4 per hour), so the endpoint cannot spam a person. |

Startup refuses a key without a usable `MAIL_FROM` or `ADMIN_APP_URL` (and http in production). With no key and no variables nothing is checked and nothing changes.

## Setting up Resend

1. Create a Resend account.
2. Add your sending domain (Domains > Add) and publish the **SPF and DKIM** DNS records Resend shows. Wait until the domain reads "Verified".
3. Create an API key with **Sending access** only (API Keys > Create, permission "Sending access", restricted to that domain).
4. In `apps/api/.env` set `RESEND_API_KEY`, `MAIL_FROM` and `ADMIN_APP_URL`. Restart the API. The Team screen now shows the email options.
5. Send yourself a test invitation.

Development without a key: copy-link only (the email checkbox is hidden). Tests never call Resend: the client is tested with a mocked `fetch`.

## Safety behaviour

- One POST per email, 5 second timeout, **no retries** (a retry after a timeout could deliver twice).
- Rate limit per workspace and per recipient in Redis. It **fails closed**: over the limit or Redis down means `emailStatus: "failed"` (no email), and the admin copies the link.
- Never logged: the token, the link, the API key, the recipient address, the subject or body. Logs hold only the outcome, an error class (e.g. `http_422_validation_error`, `timeout`, `network`) and the request id.
- Audit entries record `emailed: true/false`, never the token.

## Decision for the owner: data region and DPA

Staff names and email addresses are **personal data** and pass through Resend. Before turning mail on in production the owner must decide: the Resend data region (it offers EU sending regions; check the current options), and sign Resend's Data Processing Addendum. Record the choice in `docs/05-eu-compliance-and-payments.md` and add Resend to the processor list in the privacy notice. Until then, leave `RESEND_API_KEY` unset.
