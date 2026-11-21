// Email news (Privacy Policy §8): only for people who ask for it, and only
// once they've clicked the link in our confirmation email: double opt-in,
// every time, however they asked.
//
//  - Account holders tick "Email me news" (at sign-up, on the Account page, on
//    the News page, or the one-time question in the game). We email the
//    account's address a link, and only that link subscribes it, even when the
//    account's email is already confirmed (that proved the address is theirs,
//    not that they want news).
//  - Anyone on the website or the News page types an address: the same email
//    with a link.
//
// Every row keeps the proof of consent: when, where and the exact words agreed
// to. Unsubscribing is one click and immediate. The owner sends the news from
// Utobo: the Sales page downloads the list to import (docs/NEWSLETTER.md).
// Under-13s can't sign up (the same 13+ rule as accounts).

import { randomBytes } from 'node:crypto';
import type { Pool } from 'pg';

export type NewsletterSource = 'signup' | 'account' | 'prompt' | 'news' | 'website';
export const NEWSLETTER_SOURCES: readonly NewsletterSource[] = ['signup', 'account', 'prompt', 'news', 'website'];

/** The words people agree to (kept with each sign-up, as proof of consent). Shown in the game in their language. */
export const NEWSLETTER_WORDING =
  'Email me TardiGeddon news: new updates, events and offers, a few times a month at most. I can unsubscribe at any time.';

export async function migrateNewsletter(db: Pool): Promise<void> {
  await db.query(`
    CREATE TABLE IF NOT EXISTS newsletter (
      email           text PRIMARY KEY,
      -- The account it came from, if any (deleting the account deletes this too).
      user_id         text REFERENCES "user"(id) ON DELETE CASCADE,
      -- pending: waiting for the address to be confirmed; subscribed; unsubscribed.
      status          text NOT NULL,
      source          text NOT NULL,
      wording         text NOT NULL,
      lang            text,
      -- In the confirm and unsubscribe links.
      token           text NOT NULL UNIQUE,
      asked_at        timestamptz NOT NULL DEFAULT now(),
      confirmed_at    timestamptz,
      unsubscribed_at timestamptz
    );
    CREATE INDEX IF NOT EXISTS newsletter_user ON newsletter (user_id);
    -- Accounts that have been asked the one-time question in the game (yes or no).
    CREATE TABLE IF NOT EXISTS newsletter_asked (
      user_id text PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,
      at      timestamptz NOT NULL DEFAULT now()
    );
  `);
}

/** An email address as we keep it (lower case), or null if it doesn't look like one. */
export function cleanEmail(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const e = v.trim().toLowerCase();
  return e.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e : null;
}

const newToken = () => randomBytes(24).toString('base64url');
const cleanLang = (v: unknown) => (typeof v === 'string' && /^[a-z]{2}(-[A-Z]{2})?$/.test(v) ? v : null);
const cleanSource = (v: unknown): NewsletterSource => (NEWSLETTER_SOURCES.includes(v as NewsletterSource) ? (v as NewsletterSource) : 'website');

/**
 * Someone without an account (or not signed in) asks for news at `email`.
 * Returns the token to email them a confirm link, or null if there's nothing
 * to send (already subscribed). Never says which: the reply is the same either way.
 */
export async function askForNews(db: Pool, email: string, source: unknown, lang: unknown): Promise<string | null> {
  const token = newToken();
  const r = await db.query<{ token: string; status: string }>(
    `INSERT INTO newsletter (email, status, source, wording, lang, token) VALUES ($1, 'pending', $2, $3, $4, $5)
     ON CONFLICT (email) DO UPDATE SET
       status = CASE WHEN newsletter.status = 'subscribed' THEN 'subscribed' ELSE 'pending' END,
       source = CASE WHEN newsletter.status = 'subscribed' THEN newsletter.source ELSE EXCLUDED.source END,
       wording = CASE WHEN newsletter.status = 'subscribed' THEN newsletter.wording ELSE EXCLUDED.wording END,
       lang = coalesce(EXCLUDED.lang, newsletter.lang),
       asked_at = CASE WHEN newsletter.status = 'subscribed' THEN newsletter.asked_at ELSE now() END
     RETURNING token, status`,
    [email, cleanSource(source), NEWSLETTER_WORDING, cleanLang(lang), token],
  );
  return r.rows[0].status === 'subscribed' ? null : r.rows[0].token;
}

/** The confirm link was opened: subscribed. False if the link is unknown. */
export async function confirmNews(db: Pool, token: unknown): Promise<boolean> {
  if (typeof token !== 'string' || token.length > 64) return false;
  const r = await db.query(
    `UPDATE newsletter SET status = 'subscribed', confirmed_at = coalesce(confirmed_at, now()), unsubscribed_at = NULL
      WHERE token = $1 AND status <> 'unsubscribed' RETURNING 1`,
    [token],
  );
  return r.rowCount === 1;
}

/** One-click unsubscribe (a link in every email). False if the link is unknown. */
export async function unsubscribeNews(db: Pool, token: unknown): Promise<boolean> {
  if (typeof token !== 'string' || token.length > 64) return false;
  const r = await db.query(`UPDATE newsletter SET status = 'unsubscribed', unsubscribed_at = now() WHERE token = $1 RETURNING 1`, [token]);
  return r.rowCount === 1;
}

/**
 * An account's news setting: off at once, or on, which (like any sign-up)
 * only asks. Returns the token to email the account's address a confirm link,
 * or null if there's nothing to send (off, or already subscribed).
 */
export async function setAccountNews(
  db: Pool,
  user: { id: string; email: string },
  on: boolean,
  source: unknown,
  lang: unknown,
): Promise<string | null> {
  const email = cleanEmail(user.email);
  if (!email) return null;
  await db.query(`INSERT INTO newsletter_asked (user_id) VALUES ($1) ON CONFLICT DO NOTHING`, [user.id]);
  if (!on) {
    await db.query(`UPDATE newsletter SET status = 'unsubscribed', unsubscribed_at = now() WHERE email = $1 OR user_id = $2`, [email, user.id]);
    return null;
  }
  const r = await db.query<{ token: string; status: string }>(
    `INSERT INTO newsletter (email, user_id, status, source, wording, lang, token) VALUES ($1, $2, 'pending', $3, $4, $5, $6)
     ON CONFLICT (email) DO UPDATE SET
       user_id = EXCLUDED.user_id,
       status = CASE WHEN newsletter.status = 'subscribed' THEN 'subscribed' ELSE 'pending' END,
       source = CASE WHEN newsletter.status = 'subscribed' THEN newsletter.source ELSE EXCLUDED.source END,
       wording = CASE WHEN newsletter.status = 'subscribed' THEN newsletter.wording ELSE EXCLUDED.wording END,
       lang = coalesce(EXCLUDED.lang, newsletter.lang),
       asked_at = CASE WHEN newsletter.status = 'subscribed' THEN newsletter.asked_at ELSE now() END,
       unsubscribed_at = CASE WHEN newsletter.status = 'subscribed' THEN newsletter.unsubscribed_at ELSE NULL END
     RETURNING token, status`,
    [email, user.id, cleanSource(source), NEWSLETTER_WORDING, cleanLang(lang), newToken()],
  );
  return r.rows[0].status === 'subscribed' ? null : r.rows[0].token;
}

/** What the game shows an account: subscribed, waiting for the link in our email to be clicked, or not; and whether it's been asked. */
export async function accountNews(db: Pool, user: { id: string; email: string }): Promise<{ status: 'subscribed' | 'pending' | 'no'; asked: boolean }> {
  const email = cleanEmail(user.email) ?? '';
  const r = await db.query<{ status: string }>(`SELECT status FROM newsletter WHERE email = $1`, [email]);
  const asked = (await db.query('SELECT 1 FROM newsletter_asked WHERE user_id = $1', [user.id])).rowCount === 1;
  const s = r.rows[0]?.status;
  return { status: s === 'subscribed' ? 'subscribed' : s === 'pending' ? 'pending' : 'no', asked: asked || s !== undefined };
}

/** The one-time question in the game was answered "not now": don't ask again. */
export async function newsAsked(db: Pool, userId: string): Promise<void> {
  await db.query(`INSERT INTO newsletter_asked (user_id) VALUES ($1) ON CONFLICT DO NOTHING`, [userId]);
}

/**
 * Once ever: accounts subscribed under the old rule (a confirmed account email
 * was enough) go back to waiting, so they join only by clicking the link in a
 * new email, like everyone else. Returns who to email (the caller sends it).
 * Every account row counts, since the old rule can't be told apart from a
 * click; an address-only sign-up (no account) always clicked, so it stays.
 */
export async function reconfirmAccountNews(db: Pool): Promise<{ email: string; token: string }[]> {
  const c = await db.connect();
  try {
    await c.query('BEGIN');
    await c.query(`CREATE TABLE IF NOT EXISTS done_once (name text PRIMARY KEY, at timestamptz NOT NULL DEFAULT now())`);
    await c.query("SELECT pg_advisory_xact_lock(hashtext('newsletter_reconfirm_accounts'))");
    const done = await c.query(`SELECT 1 FROM done_once WHERE name = 'newsletter_reconfirm_accounts'`);
    let rows: { email: string; token: string }[] = [];
    if (!done.rowCount) {
      rows = (
        await c.query<{ email: string; token: string }>(
          `UPDATE newsletter SET status = 'pending', confirmed_at = NULL, asked_at = now()
            WHERE status = 'subscribed' AND user_id IS NOT NULL RETURNING email, token`,
        )
      ).rows;
      await c.query(`INSERT INTO done_once (name) VALUES ('newsletter_reconfirm_accounts')`);
    }
    await c.query('COMMIT');
    return rows;
  } catch (e) {
    await c.query('ROLLBACK');
    throw e;
  } finally {
    c.release();
  }
}

/**
 * What the Privacy Policy (5.1.4A) promises: sign-ups never confirmed go after
 * 30 days; for people who unsubscribed over 2 years ago, only the address and
 * the date stay (the "do not email" list), not the consent record.
 */
export async function purgeNewsletter(db: Pool): Promise<void> {
  await db.query(`DELETE FROM newsletter WHERE status = 'pending' AND asked_at < now() - interval '30 days'`);
  await db.query(
    `UPDATE newsletter SET wording = '', source = '', lang = NULL, user_id = NULL
      WHERE status = 'unsubscribed' AND unsubscribed_at < now() - interval '2 years' AND wording <> ''`,
  );
}

/** A CSV cell, safe for spreadsheets (no formulas). */
function cell(v: string | null): string {
  const s = v ?? '';
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/**
 * The list for Utobo (Sales page): everyone subscribed, or everyone who has
 * unsubscribed, with when and how they agreed. Names come from accounts.
 */
export async function newsletterCsv(db: Pool, which: 'subscribed' | 'unsubscribed'): Promise<string> {
  const r = await db.query<{ email: string; name: string | null; source: string; lang: string | null; confirmed_at: Date | null; unsubscribed_at: Date | null; wording: string }>(
    `SELECT n.email, u.name, n.source, n.lang, n.confirmed_at, n.unsubscribed_at, n.wording
       FROM newsletter n LEFT JOIN "user" u ON u.id = n.user_id
      WHERE n.status = $1 ORDER BY n.email`,
    [which],
  );
  const head = 'email,name,source,language,subscribed_at,unsubscribed_at,consent_wording';
  const rows = r.rows.map((x) =>
    [x.email, x.name, x.source, x.lang, x.confirmed_at?.toISOString() ?? null, x.unsubscribed_at?.toISOString() ?? null, x.wording].map(cell).join(','),
  );
  return [head, ...rows].join('\n') + '\n';
}

/** How many are subscribed, waiting, and gone (for the Sales page). */
export async function newsletterCounts(db: Pool): Promise<{ subscribed: number; pending: number; unsubscribed: number }> {
  const r = await db.query<{ status: string; n: number }>(`SELECT status, count(*)::int AS n FROM newsletter GROUP BY status`);
  const get = (s: string) => r.rows.find((x) => x.status === s)?.n ?? 0;
  return { subscribed: get('subscribed'), pending: get('pending'), unsubscribed: get('unsubscribed') };
}
