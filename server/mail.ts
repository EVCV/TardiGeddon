// Emails the server sends: password reset links and "confirm your email".
// Sent over SMTP, which every email service offers (Emailit, Resend,
// Postmark, Amazon SES, ...), so changing service is only a change of
// secrets. Off unless SMTP_HOST is set; the game works the same without it,
// just with no "Forgot password?". See docs/ACCOUNTS.md.

import nodemailer from 'nodemailer';

export interface MailEnv {
  SMTP_HOST?: string;
  /** Default 587 (STARTTLS); 465 means TLS from the start. */
  SMTP_PORT?: string;
  SMTP_USER?: string;
  SMTP_PASS?: string;
  /** Who the emails come from. Default: TardiGeddon <noreply@tardigeddon.com> */
  MAIL_FROM?: string;
}

export interface Mail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

/** Sends one email; rejects if the email service refuses it. */
export type Mailer = (mail: Mail) => Promise<void>;

export function smtpMailer(env: MailEnv): Mailer | null {
  if (!env.SMTP_HOST) return null;
  const port = Number(env.SMTP_PORT) || 587;
  const transport = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port,
    secure: port === 465,
    // Never send a password over an unencrypted connection.
    requireTLS: port !== 465,
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS ?? '' } : undefined,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
    // Plain text and HTML only: no attachments or remote content to fetch.
    disableFileAccess: true,
    disableUrlAccess: true,
  });
  const from = env.MAIL_FROM || 'TardiGeddon <noreply@tardigeddon.com>';
  return async (m) => {
    await transport.sendMail({ from, to: m.to, subject: m.subject, text: m.text, html: m.html });
  };
}

/** Text a player typed (their name) made safe to put inside HTML. */
export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

/** A short branded email with one big button. `name` is escaped here. */
function layout(name: string, intro: string, button: string, url: string, outro: string): { text: string; html: string } {
  const text = `Hi ${name},\n\n${intro}\n\n${url}\n\n${outro}\n\nTardiGeddon · EVCV Limited\nhttps://tardigeddon.com`;
  const u = escapeHtml(url);
  const html = `<!doctype html><html><body style="margin:0;background:#d9f3ff;font-family:Arial,Helvetica,sans-serif;color:#2b1b24">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#fff8ec;border:4px solid #2b1b24;border-radius:18px">
<tr><td style="padding:24px 24px 8px;font-size:26px;font-weight:bold;color:#e04848">TardiGeddon</td></tr>
<tr><td style="padding:8px 24px;font-size:16px;line-height:1.5">Hi ${escapeHtml(name)},<br><br>${escapeHtml(intro)}</td></tr>
<tr><td align="center" style="padding:16px 24px"><a href="${u}" style="display:inline-block;background:#ffd84a;color:#2b1b24;border:3px solid #2b1b24;border-radius:14px;padding:12px 24px;font-size:18px;font-weight:bold;text-decoration:none">${escapeHtml(button)}</a></td></tr>
<tr><td style="padding:8px 24px;font-size:13px;line-height:1.5;color:#5a4650">If the button doesn't work, copy this link into your browser:<br><a href="${u}" style="color:#3a7be0;word-break:break-all">${u}</a></td></tr>
<tr><td style="padding:8px 24px 24px;font-size:14px;line-height:1.5">${escapeHtml(outro)}</td></tr>
</table>
<p style="font-size:12px;color:#5a4650">TardiGeddon · EVCV Limited · <a href="https://tardigeddon.com" style="color:#3a7be0">tardigeddon.com</a></p>
</td></tr></table></body></html>`;
  return { text, html };
}

export function resetEmail(to: string, name: string, url: string): Mail {
  return {
    to,
    subject: 'Reset your TardiGeddon password',
    ...layout(
      name,
      'Someone (hopefully you) asked to reset the password for your TardiGeddon account. Click below to choose a new one. The link works once, for one hour.',
      'Choose a new password',
      url,
      "If you didn't ask for this, you can ignore this email: your password stays the same.",
    ),
  };
}

export function verifyEmail(to: string, name: string, url: string): Mail {
  return {
    to,
    subject: 'Confirm your email for TardiGeddon',
    ...layout(
      name,
      'Thanks for signing up! Please confirm this is your email address, so you can always get back into your account. The link works for 24 hours.',
      'Confirm my email',
      url,
      "If you didn't create a TardiGeddon account, you can ignore this email.",
    ),
  };
}
