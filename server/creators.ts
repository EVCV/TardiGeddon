// Creator codes (Terms 5.12): codes the owner gives to creators (streamers,
// YouTubers) for their audience. A new player who enters one gets the same
// reward as a friend's invite (server/rewards.ts); the creator earns a share
// of what those players spend on coins for a while after they join, which
// the owner pays by hand each month and marks as paid on the Sales page.
//
// What a creator has earned is worked out from the purchase records each
// time, so a refund or chargeback simply stops counting; the payouts table
// is what has been paid. Shares are of an estimate of what reaches us
// (NET_SHARE): the price less VAT and the store's or Stripe's cut.

import type { Pool } from 'pg';

/** A creator's code: 3 to 16 letters and digits, as typed (case doesn't matter). */
export function normaliseCreatorCode(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const c = v.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return c.length >= 3 && c.length <= 16 ? c : null;
}

/** Defaults for a new creator (Terms 5.12): their share, and for how long after each player joins. */
export const CREATOR_PERCENT = 10;
export const CREATOR_MONTHS = 12;

/**
 * Roughly what reaches us of a price paid, per way of paying: prices include
 * VAT (20% in the UK, about the same elsewhere: 1/1.2), then Apple and Google
 * keep 15% (Small Business Programme) and Stripe's Managed Payments and card
 * fees about 5%. An estimate for creator shares, not the accounts.
 */
const NET_SHARE = { apple: 0.85 / 1.2, google: 0.85 / 1.2, stripe: 0.95 / 1.2 };

export async function migrateCreators(db: Pool): Promise<void> {
  await db.query(`
    CREATE TABLE IF NOT EXISTS creator (
      code       text PRIMARY KEY,
      name       text NOT NULL,
      -- Their game account, if they have one: then the Account page shows them their numbers.
      user_id    text REFERENCES "user"(id) ON DELETE SET NULL,
      percent    integer NOT NULL,
      months     integer NOT NULL,
      active     boolean NOT NULL DEFAULT true,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    -- Players who joined with a creator's code (one code per player, like invites).
    CREATE TABLE IF NOT EXISTS creator_player (
      user_id text PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,
      code    text NOT NULL REFERENCES creator(code),
      at      timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS creator_player_code ON creator_player (code);
    -- Money paid to creators, by hand, in the currency's smallest unit.
    CREATE TABLE IF NOT EXISTS creator_payout (
      id       bigserial PRIMARY KEY,
      code     text NOT NULL REFERENCES creator(code),
      amount   integer NOT NULL,
      currency text NOT NULL,
      note     text NOT NULL DEFAULT '',
      at       timestamptz NOT NULL DEFAULT now()
    );
  `);
}

/** The active creator with this code, if any. */
export async function creatorByCode(db: Pool, code: string): Promise<{ code: string; userId: string | null } | null> {
  const r = await db.query<{ code: string; user_id: string | null }>('SELECT code, user_id FROM creator WHERE code = $1 AND active', [code]);
  return r.rows[0] ? { code: r.rows[0].code, userId: r.rows[0].user_id } : null;
}

/** Remember that this player joined with a creator's code. False if they already used a code. */
export async function joinCreator(db: Pool, userId: string, code: string): Promise<boolean> {
  const r = await db.query('INSERT INTO creator_player (user_id, code) VALUES ($1, $2) ON CONFLICT DO NOTHING', [userId, code]);
  return r.rowCount === 1;
}

export interface CreatorMonth {
  /** YYYY-MM (UTC). */
  month: string;
  currency: string;
  /** What their players paid (VAT included), and the creator's share of our estimated net. */
  gross: number;
  earned: number;
}

export interface CreatorReport {
  code: string;
  name: string;
  /** The linked game account's player name, if any. */
  account: string | null;
  percent: number;
  months: number;
  active: boolean;
  players: number;
  payers: number;
  byMonth: CreatorMonth[];
  /** Per currency: earned in all, paid, and still owed. */
  totals: { currency: string; earned: number; paid: number; owed: number }[];
}

/** Every creator's numbers (or one's), for the Sales page and the creator's own Account page. Totals only, never who. */
export async function creatorReports(db: Pool, code?: string): Promise<CreatorReport[]> {
  const creators = await db.query<{ code: string; name: string; account: string | null; percent: number; months: number; active: boolean }>(
    `SELECT c.code, c.name, u.name AS account, c.percent, c.months, c.active FROM creator c LEFT JOIN "user" u ON u.id = c.user_id
      ${code ? 'WHERE c.code = $1' : ''} ORDER BY c.created_at`,
    code ? [code] : [],
  );
  const out: CreatorReport[] = [];
  for (const c of creators.rows) {
    const players = await db.query<{ n: number }>('SELECT count(*)::int AS n FROM creator_player WHERE code = $1', [c.code]);
    // Paid purchases (not refunded or disputed) by their players, within `months` of joining.
    const buys = await db.query<{ user_id: string; month: string; currency: string; amount: number; id: string; payment_intent: string | null }>(
      `SELECT p.user_id, to_char(p.created_at AT TIME ZONE 'UTC', 'YYYY-MM') AS month, p.currency, p.amount, p.id, p.payment_intent
         FROM purchase p JOIN creator_player cp ON cp.user_id = p.user_id
        WHERE cp.code = $1 AND p.status = 'paid' AND p.amount > 0 AND p.created_at < cp.at + make_interval(months => $2)`,
      [c.code, c.months],
    );
    const months = new Map<string, CreatorMonth>();
    const payers = new Set<string>();
    for (const b of buys.rows) {
      payers.add(b.user_id);
      const how = b.id.startsWith('apple:') ? 'apple' : b.payment_intent?.startsWith('gplay:') ? 'google' : 'stripe';
      const key = `${b.month}|${b.currency}`;
      const m = months.get(key) ?? { month: b.month, currency: b.currency, gross: 0, earned: 0 };
      m.gross += b.amount;
      m.earned += (b.amount * NET_SHARE[how] * c.percent) / 100;
      months.set(key, m);
    }
    const byMonth = [...months.values()].map((m) => ({ ...m, earned: Math.floor(m.earned) })).sort((a, b) => b.month.localeCompare(a.month));
    const paid = await db.query<{ currency: string; paid: number }>('SELECT currency, sum(amount)::int AS paid FROM creator_payout WHERE code = $1 GROUP BY currency', [c.code]);
    const currencies = new Set([...byMonth.map((m) => m.currency), ...paid.rows.map((p) => p.currency)]);
    const totals = [...currencies].map((currency) => {
      const earned = byMonth.filter((m) => m.currency === currency).reduce((s, m) => s + m.earned, 0);
      const p = paid.rows.find((x) => x.currency === currency)?.paid ?? 0;
      return { currency, earned, paid: p, owed: earned - p };
    });
    out.push({ ...c, players: players.rows[0].n, payers: payers.size, byMonth, totals });
  }
  return out;
}

/** Add a creator, or change one (name, account, share, months, on or off). */
export async function saveCreator(
  db: Pool,
  c: { code: string; name: string; email?: string | null; percent?: number; months?: number; active?: boolean },
): Promise<'ok' | 'no-account'> {
  let userId: string | null = null;
  if (c.email) {
    const u = await db.query<{ id: string }>('SELECT id FROM "user" WHERE lower(email) = lower($1)', [c.email]);
    if (!u.rows[0]) return 'no-account';
    userId = u.rows[0].id;
  }
  await db.query(
    `INSERT INTO creator (code, name, user_id, percent, months, active) VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (code) DO UPDATE SET name = $2, user_id = $3, percent = $4, months = $5, active = $6`,
    [c.code, c.name, userId, c.percent ?? CREATOR_PERCENT, c.months ?? CREATOR_MONTHS, c.active ?? true],
  );
  return 'ok';
}

/** Record money paid to a creator (by bank transfer or PayPal, outside the game). */
export async function recordCreatorPayout(db: Pool, code: string, amount: number, currency: string, note: string): Promise<boolean> {
  const r = await db.query(
    'INSERT INTO creator_payout (code, amount, currency, note) SELECT $1, $2, $3, $4 WHERE EXISTS (SELECT 1 FROM creator WHERE code = $1)',
    [code, amount, currency, note],
  );
  return r.rowCount === 1;
}

/** The creator code linked to this game account, if any. */
export async function creatorCodeOf(db: Pool, userId: string): Promise<string | null> {
  const r = await db.query<{ code: string }>('SELECT code FROM creator WHERE user_id = $1 ORDER BY created_at LIMIT 1', [userId]);
  return r.rows[0]?.code ?? null;
}
