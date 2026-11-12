// Contest prizes: the owner puts looks (cosmetics only, never coins, Slime or
// weapons) straight onto one player's account, found by email, from the Sales
// page. They are on the account, so they show on every platform; no codes are
// involved (the iOS app can't take codes that unlock things Apple doesn't sell).
//
// Each grant that gave something is recorded in the `prize` table (an audit
// trail for the owner), and the winner is told once the next time the game
// loads their account (/api/me's prizeNews).

import type { Pool } from 'pg';
import { PRIZE_MAX_ITEMS, prizeLook } from '../src/shop/catalog';

export async function migratePrizes(db: Pool): Promise<void> {
  await db.query(`
    CREATE TABLE IF NOT EXISTS prize (
      id         bigserial PRIMARY KEY,
      user_id    text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
      -- The looks this grant newly gave (ones they already had aren't listed).
      items      text[] NOT NULL,
      note       text NOT NULL DEFAULT '',
      granted_by text REFERENCES "user"(id) ON DELETE SET NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      -- Whether the winner has been told (the game's pop-up).
      seen       boolean NOT NULL DEFAULT false
    );
    CREATE INDEX IF NOT EXISTS prize_by_user ON prize (user_id);
  `);
}

/** The prize items from a request: 1 to PRIZE_MAX_ITEMS distinct looks, or what's wrong (naming the bad id). */
export function prizeItems(v: unknown): { items: string[] } | { error: string } {
  if (!Array.isArray(v) || !v.length) return { error: 'Pick at least one look.' };
  const items = [...new Set(v)];
  if (items.length > PRIZE_MAX_ITEMS) return { error: `A prize can have up to ${PRIZE_MAX_ITEMS} looks.` };
  for (const id of items) {
    if (typeof id !== 'string' || !prizeLook(id)) return { error: `"${typeof id === 'string' ? id.slice(0, 60) : String(id)}" isn't a look that can be given as a prize.` };
  }
  return { items: items as string[] };
}

/** The note on a grant: trimmed, at most 200 characters. */
export function prizeNote(v: unknown): string {
  return typeof v === 'string' ? v.trim().slice(0, 200) : '';
}

export interface PrizeResult {
  /** Looks that were new to the player, and ones they already had. */
  granted: string[];
  alreadyOwned: string[];
  /** The winner, for the owner to check it's the right person. */
  player: { name: string; email: string; emailVerified: boolean };
}

/**
 * Give these looks to the account with this email (any case): the ones they
 * don't own yet, as source `prize`. Safe to repeat: nothing is given twice.
 * Null if no account has that email. `items` must already be checked (prizeItems).
 */
export async function givePrize(db: Pool, adminId: string, email: string, items: string[], note: string): Promise<PrizeResult | null> {
  const c = await db.connect();
  try {
    await c.query('BEGIN');
    const u = await c.query<{ id: string; name: string; email: string; emailVerified: boolean }>(
      'SELECT id, name, email, "emailVerified" FROM "user" WHERE lower(email) = lower($1) LIMIT 1',
      [email.trim()],
    );
    const user = u.rows[0];
    if (!user) {
      await c.query('ROLLBACK');
      return null;
    }
    const granted: string[] = [];
    const alreadyOwned: string[] = [];
    for (const item of items) {
      const r = await c.query(`INSERT INTO inventory (user_id, item, source) VALUES ($1, $2, 'prize') ON CONFLICT DO NOTHING`, [user.id, item]);
      (r.rowCount ? granted : alreadyOwned).push(item);
    }
    if (granted.length) await c.query('INSERT INTO prize (user_id, items, note, granted_by) VALUES ($1, $2, $3, $4)', [user.id, granted, note, adminId]);
    await c.query('COMMIT');
    return { granted, alreadyOwned, player: { name: user.name, email: user.email, emailVerified: user.emailVerified === true } };
  } catch (e) {
    await c.query('ROLLBACK');
    throw e;
  } finally {
    c.release();
  }
}

export interface PrizeRow {
  at: string;
  email: string;
  name: string;
  items: string[];
  note: string;
}

/** The last 100 grants, newest first (the Sales page). */
export async function recentPrizes(db: Pool): Promise<PrizeRow[]> {
  const r = await db.query<{ at: Date; email: string; name: string; items: string[]; note: string }>(
    `SELECT p.created_at AS at, u.email, u.name, p.items, p.note
       FROM prize p JOIN "user" u ON u.id = p.user_id
      ORDER BY p.created_at DESC, p.id DESC LIMIT 100`,
  );
  return r.rows.map((x) => ({ ...x, at: new Date(x.at).toISOString() }));
}

/** Prizes that came in since this player last looked (told once): the looks, all grants together. Null if nothing. */
export async function prizeNews(db: Pool, userId: string): Promise<{ items: string[] } | null> {
  const r = await db.query<{ items: string[] }>('UPDATE prize SET seen = true WHERE user_id = $1 AND NOT seen RETURNING items', [userId]);
  if (!r.rowCount) return null;
  return { items: [...new Set(r.rows.flatMap((x) => x.items))] };
}
