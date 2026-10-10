import { describe, expect, it } from 'vitest';
import { escapeHtml, resetEmail, smtpMailer, verifyEmail } from '../server/mail';

describe('account emails', () => {
  it('are off without an email service', () => {
    expect(smtpMailer({})).toBeNull();
    expect(smtpMailer({ SMTP_HOST: 'mail.example.com', SMTP_USER: 'u', SMTP_PASS: 'p' })).toBeTypeOf('function');
  });

  it('carry the link in both the text and the HTML, with names escaped', () => {
    const url = 'https://tardigeddon.com/play/?reset=abc&x="1"';
    for (const m of [resetEmail('a@b.c', '<b>Bob</b>', url), verifyEmail('a@b.c', '<b>Bob</b>', url)]) {
      expect(m.text).toContain(url);
      expect(m.html).toContain(escapeHtml(url));
      expect(m.html).not.toContain('<b>Bob');
      expect(m.html).toContain('&lt;b&gt;Bob&lt;/b&gt;');
    }
    expect(escapeHtml(`<a href="x" title='y'>&</a>`)).toBe('&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;&lt;/a&gt;');
  });
});
