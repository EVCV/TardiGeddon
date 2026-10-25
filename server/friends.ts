// Friends: players add each other with friend codes (no chat, ever). A
// request only becomes a friendship when the other player accepts, and only
// friends see each other's online status and room, or invite each other.
// Friends are named by their friend code in the API, never by account id.

import type { Pool } from 'pg';
import { randomInt } from 'node:crypto';
import { GIFT_ALPHABET } from '../src/shop/catalog';

/** Most friends (and open requests) one player can have. */
export const MAX_FRIENDS = 100;

export async function migrateFriends(db: Pool): Promise<void> {
  await db.query(`
    CREATE TABLE IF NOT EXISTS friend_code (
      user_id text PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,
      code    text NOT NULL UNIQUE
    );
    -- One row per direction: 'asked' (user_id asked friend_id), or 'friends' (both rows).
    CREATE TABLE IF NOT EXISTS friend (
      user_id   text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
      friend_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
      state     text NOT NULL,
      at        timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (user_id, friend_id)
    );
    CREATE INDEX IF NOT EXISTS friend_by_friend ON friend (friend_id);
  `);
}

/** A player's friend code: eight letters and numbers, made the first time it's asked for. */
export async function friendCode(db: Pool, userId: string): Promise<string> {
  const have = await db.query('SELECT code FROM friend_code WHERE user_id = $1', [userId]);
  if (have.rows[0]) return have.rows[0].code as string;
  for (;;) {
    const code = Array.from({ length: 8 }, () => GIFT_ALPHABET[randomInt(GIFT_ALPHABET.length)]).join('');
    const r = await db.query('INSERT INTO friend_code (user_id, code) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING code', [userId, code]);
    if (r.rows[0]) return code;
    const again = await db.query('SELECT code FROM friend_code WHERE user_id = $1', [userId]);
    if (again.rows[0]) return again.rows[0].code as string;
  }
}

export function normaliseFriendCode(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const c = v.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return c.length === 8 && [...c].every((ch) => GIFT_ALPHABET.includes(ch)) ? c : null;
}

export async function userByCode(db: Pool, code: string): Promise<string | null> {
  const r = await db.query('SELECT user_id FROM friend_code WHERE code = $1', [code]);
  return (r.rows[0]?.user_id as string | undefined) ?? null;
}

export type AddResult = 'asked' | 'friends' | 'self' | 'unknown' | 'full';

/** Ask someone to be friends by their code; if they'd already asked you, you're friends now. */
export async function addFriend(db: Pool, userId: string, code: string): Promise<AddResult> {
  const other = await userByCode(db, code);
  if (!other) return 'unknown';
  if (other === userId) return 'self';
  const count = await db.query('SELECT count(*)::int AS n FROM friend WHERE user_id = $1', [userId]);
  const theyAsked = await db.query("SELECT 1 FROM friend WHERE user_id = $1 AND friend_id = $2 AND state IN ('asked', 'friends')", [other, userId]);
  if (theyAsked.rows[0]) {
    await db.query(
      `INSERT INTO friend (user_id, friend_id, state) VALUES ($1, $2, 'friends'), ($2, $1, 'friends')
       ON CONFLICT (user_id, friend_id) DO UPDATE SET state = 'friends', at = now()`,
      [userId, other],
    );
    return 'friends';
  }
  if (count.rows[0].n >= MAX_FRIENDS) return 'full';
  await db.query("INSERT INTO friend (user_id, friend_id, state) VALUES ($1, $2, 'asked') ON CONFLICT DO NOTHING", [userId, other]);
  return 'asked';
}

/** Unfriend, decline a request, or take back your own: the link goes both ways. */
export async function removeFriend(db: Pool, userId: string, code: string): Promise<void> {
  const other = await userByCode(db, code);
  if (other) await db.query('DELETE FROM friend WHERE (user_id = $1 AND friend_id = $2) OR (user_id = $2 AND friend_id = $1)', [userId, other]);
}

/** Are these two friends (both said yes)? */
export async function areFriends(db: Pool, a: string, b: string): Promise<boolean> {
  const r = await db.query("SELECT 1 FROM friend WHERE user_id = $1 AND friend_id = $2 AND state = 'friends'", [a, b]);
  return r.rows.length > 0;
}

export interface FriendRow {
  code: string;
  name: string;
  userId: string;
}

/** Friends, requests to you, and your own requests still waiting. */
export async function friendLists(db: Pool, userId: string): Promise<{ friends: FriendRow[]; requests: FriendRow[]; sent: FriendRow[] }> {
  const rows = async (sql: string) =>
    (await db.query(sql, [userId])).rows.map((x) => ({ code: String(x.code), name: String(x.name), userId: String(x.id) }));
  const friends = await rows(`
    SELECT u.id, u.name, c.code FROM friend f JOIN "user" u ON u.id = f.friend_id JOIN friend_code c ON c.user_id = u.id
     WHERE f.user_id = $1 AND f.state = 'friends' ORDER BY lower(u.name)`);
  const requests = await rows(`
    SELECT u.id, u.name, c.code FROM friend f JOIN "user" u ON u.id = f.user_id JOIN friend_code c ON c.user_id = u.id
     WHERE f.friend_id = $1 AND f.state = 'asked' ORDER BY f.at DESC`);
  const sent = await rows(`
    SELECT u.id, u.name, c.code FROM friend f JOIN "user" u ON u.id = f.friend_id JOIN friend_code c ON c.user_id = u.id
     WHERE f.user_id = $1 AND f.state = 'asked' ORDER BY f.at DESC`);
  return { friends, requests, sent };
}
