// Contest prizes: the owner puts looks (cosmetics only, never coins, Slime or
// weapons) straight onto one player's account, found by email, from the Sales
// page. They are on the account, so they show on every platform; no codes are
// involved (the iOS app can't take codes that unlock things Apple doesn't sell).
//
// Each grant that gave something is recorded in the `prize` table (an audit
// trail for the owner), and the winner is told once the next time the game
// loads their account (/api/me's prizeNews).

import type { Pool } from 'pg';
import { prizeLook } from '../src/shop/catalog';
import { PRIZE_GRANT_MAX, type PrizeBadge } from '../src/shop/prizeRules';

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
    -- The badge a grant newly gave ('winner' = 🏆 Launch Winner), if any. The badge lasts while this row does.
    ALTER TABLE prize ADD COLUMN IF NOT EXISTS badge text;
  `);
}

/** The prize items from a request: 1 to PRIZE_GRANT_MAX distinct looks (none is fine when only a badge is given), or what's wrong (naming the bad id). */
export function prizeItems(v: unknown, badgeOnlyOk = false): { items: string[] } | { error: string } {
  if (v === undefined && badgeOnlyOk) return { items: [] };
  if (!Array.isArray(v) || (!v.length && !badgeOnlyOk)) return { error: 'Pick at least one look.' };
  const items = [...new Set(v)];
  if (items.length > PRIZE_GRANT_MAX) return { error: `A prize can have up to ${PRIZE_GRANT_MAX} looks.` };
  for (const id of items) {
    if (typeof id !== 'string' || !prizeLook(id)) return { error: `"${typeof id === 'string' ? id.slice(0, 60) : String(id)}" isn't a look that can be given as a prize.` };
  }
  return { items: items as string[] };
}

/** The note on a grant: trimmed, at most 200 characters. */
export function prizeNote(v: unknown): string {
  return typeof v === 'string' ? v.trim().slice(0, 200) : '';
}

/** The badge from a request: only 'winner' is known; anything else is no badge. */
export function prizeBadge(v: unknown): PrizeBadge | null {
  return v === 'winner' ? 'winner' : null;
}

/** Has this account been given the 🏆 Launch Winner badge? (Shown by their name, here and to others online.) */
export async function winnerBadge(db: Pool, userId: string): Promise<boolean> {
  return (await db.query(`SELECT 1 FROM prize WHERE user_id = $1 AND badge = 'winner' LIMIT 1`, [userId])).rowCount! > 0;
}

export interface PrizeResult {
  /** Looks that were new to the player, and ones they already had. */
  granted: string[];
  alreadyOwned: string[];
  /** The badge this grant newly gave (null: none asked for, or they already had it). */
  badge: PrizeBadge | null;
  /** Whether they have the 🏆 badge now. */
  hasBadge: boolean;
  /** The winner, for the owner to check it's the right person. */
  player: { name: string; email: string; emailVerified: boolean };
}

/**
 * Give these looks to the account with this email (any case): the ones they
 * don't own yet, as source `prize`, and the 🏆 badge if asked (once). Safe to
 * repeat: nothing is given twice. Null if no account has that email. `items`
 * must already be checked (prizeItems).
 */
export async function givePrize(db: Pool, adminId: string, email: string, items: string[], note: string, badge: PrizeBadge | null = null): Promise<PrizeResult | null> {
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
    // The badge is recorded on the grant that first gave it (a badge on its own is a grant too).
    const had = (await c.query(`SELECT 1 FROM prize WHERE user_id = $1 AND badge = 'winner' LIMIT 1`, [user.id])).rowCount! > 0;
    const newBadge = badge && !had ? badge : null;
    if (granted.length || newBadge) await c.query('INSERT INTO prize (user_id, items, note, granted_by, badge) VALUES ($1, $2, $3, $4, $5)', [user.id, granted, note, adminId, newBadge]);
    await c.query('COMMIT');
    return { granted, alreadyOwned, badge: newBadge, hasBadge: had || newBadge !== null, player: { name: user.name, email: user.email, emailVerified: user.emailVerified === true } };
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
  /** The badge this grant gave ('winner'), if any. */
  badge: PrizeBadge | null;
}

/** The last 100 grants, newest first (the Sales page). */
export async function recentPrizes(db: Pool): Promise<PrizeRow[]> {
  const r = await db.query<{ at: Date; email: string; name: string; items: string[]; note: string; badge: PrizeBadge | null }>(
    `SELECT p.created_at AS at, u.email, u.name, p.items, p.note, p.badge
       FROM prize p JOIN "user" u ON u.id = p.user_id
      ORDER BY p.created_at DESC, p.id DESC LIMIT 100`,
  );
  return r.rows.map((x) => ({ ...x, at: new Date(x.at).toISOString() }));
}

/** Prizes that came in since this player last looked (told once): the looks (all grants together) and whether the 🏆 badge was among them. Null if nothing. */
export async function prizeNews(db: Pool, userId: string): Promise<{ items: string[]; badge?: PrizeBadge } | null> {
  const r = await db.query<{ items: string[]; badge: PrizeBadge | null }>('UPDATE prize SET seen = true WHERE user_id = $1 AND NOT seen RETURNING items, badge', [userId]);
  if (!r.rowCount) return null;
  return { items: [...new Set(r.rows.flatMap((x) => x.items))], ...(r.rows.some((x) => x.badge === 'winner') ? { badge: 'winner' as const } : {}) };
}
