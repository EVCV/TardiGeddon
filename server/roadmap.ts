// The roadmap's player side (docs/ROADMAP.md): votes on roadmap items, and the
// private suggestion box. The routes are in server/accounts.ts; every write
// there passes Cloudflare Turnstile first (server/turnstile.ts).
//
// - Votes: one per account per item, public only as totals per item.
// - Suggestions: only the owner reads them (the Sales page). Kept with the
//   account until it is deleted (ON DELETE CASCADE), or 24 months.

import type { Pool } from 'pg';
import { ADMIN_NOTE_MAX, cleanText, ideaKey, isSuggestionCategory, isSuggestionStatus, type SuggestionCategory, type SuggestionStatus, SUGGESTION_STATUSES } from '../src/news/suggest';

/** Most ideas one account can send in a day (any 24 hours), and one address in an hour. */
export const SUGGESTIONS_PER_DAY = 5;
export const SUGGESTIONS_PER_IP_HOUR = 10;
/** The same idea twice from one account within this many days is refused. */
export const DUPLICATE_DAYS = 30;
/** Ideas are deleted this long after they were sent, if the account hasn't been deleted before. */
export const SUGGESTION_KEEP_MONTHS = 24;
/** The most ideas the owner's page lists at once. */
const LIST_MAX = 300;

export async function migrateRoadmap(db: Pool): Promise<void> {
  await db.query(`
    -- One row per account per roadmap item (news post id): a vote. Deleted with the account.
    CREATE TABLE IF NOT EXISTS roadmap_vote (
      user_id    text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
      item_id    text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (user_id, item_id)
    );
    CREATE INDEX IF NOT EXISTS roadmap_vote_item ON roadmap_vote (item_id);
    -- Ideas from the Roadmap view. Private: only the owner's Sales page reads them. Deleted with the account.
    CREATE TABLE IF NOT EXISTS suggestion (
      id         bigserial PRIMARY KEY,
      user_id    text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
      category   text NOT NULL,
      text       text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      status     text NOT NULL DEFAULT 'new',
      admin_note text
    );
    CREATE INDEX IF NOT EXISTS suggestion_by_user ON suggestion (user_id, created_at);
    CREATE INDEX IF NOT EXISTS suggestion_by_status ON suggestion (status, created_at DESC);
  `);
}

/** Ideas older than 24 months go (hourly, with the other purges). */
export async function purgeSuggestions(db: Pool): Promise<void> {
  await db.query(`DELETE FROM suggestion WHERE created_at < now() - make_interval(months => $1)`, [SUGGESTION_KEEP_MONTHS]);
}

/**
 * Allow one more of something, or not: `key` may do it `max` times in `windowMs`
 * (kept in memory: a restart forgets, which only ever lets a few extra through).
 */
export function allow(tries: Map<string, number[]>, key: string, windowMs: number, max: number, now = Date.now()): boolean {
  const recent = (tries.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= max) {
    tries.set(key, recent);
    return false;
  }
  tries.set(key, [...recent, now]);
  // Never let it grow without end.
  if (tries.size > 10_000) tries.clear();
  return true;
}

// ---- Votes ----

let cache: { at: number; counts: Map<string, number> } | null = null;
const CACHE_MS = 15_000;

/** Votes per roadmap item (only the ids given: anything else in the table is ignored). Counted at most every 15 seconds. */
export async function voteCounts(db: Pool, ids: Set<string>): Promise<Record<string, number>> {
  const now = Date.now();
  if (!cache || now - cache.at > CACHE_MS) {
    const r = await db.query('SELECT item_id, count(*)::int AS n FROM roadmap_vote GROUP BY item_id');
    cache = { at: now, counts: new Map(r.rows.map((x: { item_id: string; n: number }) => [x.item_id, x.n])) };
  }
  const out: Record<string, number> = {};
  for (const id of ids) out[id] = cache.counts.get(id) ?? 0;
  return out;
}

/** The items this account has voted for. */
export async function myVotes(db: Pool, userId: string, ids: Set<string>): Promise<string[]> {
  const r = await db.query('SELECT item_id FROM roadmap_vote WHERE user_id = $1', [userId]);
  return r.rows.map((x: { item_id: string }) => x.item_id).filter((id) => ids.has(id));
}

/** Vote for an item, or take the vote back; returns the item's votes now. Safe to repeat. */
export async function setVote(db: Pool, userId: string, itemId: string, on: boolean): Promise<number> {
  if (on) await db.query('INSERT INTO roadmap_vote (user_id, item_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [userId, itemId]);
  else await db.query('DELETE FROM roadmap_vote WHERE user_id = $1 AND item_id = $2', [userId, itemId]);
  cache = null;
  const r = await db.query('SELECT count(*)::int AS n FROM roadmap_vote WHERE item_id = $1', [itemId]);
  return r.rows[0].n as number;
}

/** Tests: forget the counted totals. */
export function forgetVoteCache(): void {
  cache = null;
}

// ---- Suggestions ----

export type SuggestResult = { ok: true; id: number } | { ok: false; why: 'limit' | 'duplicate' };

/**
 * Keep an idea (already cleaned and checked: src/news/suggest.ts), unless this
 * account has sent too many today or already sent the same one lately. The check
 * and the insert are one step per account, so two at once can't both slip past the limit.
 */
export async function addSuggestion(db: Pool, userId: string, category: SuggestionCategory, text: string): Promise<SuggestResult> {
  const c = await db.connect();
  try {
    await c.query('BEGIN');
    await c.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`suggestion:${userId}`]);
    const recent = await c.query(`SELECT text, created_at > now() - interval '24 hours' AS today FROM suggestion WHERE user_id = $1 AND created_at > now() - make_interval(days => $2)`, [userId, DUPLICATE_DAYS]);
    const rows = recent.rows as { text: string; today: boolean }[];
    if (rows.filter((r) => r.today).length >= SUGGESTIONS_PER_DAY) {
      await c.query('ROLLBACK');
      return { ok: false, why: 'limit' };
    }
    const key = ideaKey(text);
    if (rows.some((r) => ideaKey(r.text) === key)) {
      await c.query('ROLLBACK');
      return { ok: false, why: 'duplicate' };
    }
    const r = await c.query('INSERT INTO suggestion (user_id, category, text) VALUES ($1, $2, $3) RETURNING id', [userId, category, text]);
    await c.query('COMMIT');
    return { ok: true, id: Number(r.rows[0].id) };
  } catch (e) {
    await c.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}

/** Would this account's idea be refused (too many today, or sent already)? Asked before the security check, so nobody spends one on a refusal. */
export async function suggestionRefusal(db: Pool, userId: string, text: string): Promise<'limit' | 'duplicate' | null> {
  const r = await db.query(`SELECT text, created_at > now() - interval '24 hours' AS today FROM suggestion WHERE user_id = $1 AND created_at > now() - make_interval(days => $2)`, [userId, DUPLICATE_DAYS]);
  const rows = r.rows as { text: string; today: boolean }[];
  if (rows.filter((x) => x.today).length >= SUGGESTIONS_PER_DAY) return 'limit';
  const key = ideaKey(text);
  return rows.some((x) => ideaKey(x.text) === key) ? 'duplicate' : null;
}

// ---- The owner's list ----

export interface SuggestionRow {
  id: number;
  category: SuggestionCategory;
  text: string;
  status: SuggestionStatus;
  admin_note: string | null;
  created_at: string;
  /** The player's name (never their email). */
  name: string;
}

/** Ideas, newest first, for one status (or all): the owner's page. With how many each status has. */
export async function listSuggestions(db: Pool, status: SuggestionStatus | 'all'): Promise<{ suggestions: SuggestionRow[]; counts: Record<SuggestionStatus, number> }> {
  const r = await db.query(
    `SELECT s.id, s.category, s.text, s.status, s.admin_note, s.created_at, u.name
       FROM suggestion s JOIN "user" u ON u.id = s.user_id
      WHERE $1::text = 'all' OR s.status = $1
      ORDER BY s.created_at DESC, s.id DESC
      LIMIT $2`,
    [status, LIST_MAX],
  );
  const c = await db.query('SELECT status, count(*)::int AS n FROM suggestion GROUP BY status');
  const counts = Object.fromEntries(SUGGESTION_STATUSES.map((s) => [s, 0])) as Record<SuggestionStatus, number>;
  for (const row of c.rows as { status: string; n: number }[]) if (isSuggestionStatus(row.status)) counts[row.status] = row.n;
  return {
    suggestions: r.rows.map((x: Record<string, unknown>) => ({
      id: Number(x.id),
      category: isSuggestionCategory(x.category) ? x.category : 'other',
      text: String(x.text),
      status: isSuggestionStatus(x.status) ? x.status : 'new',
      admin_note: typeof x.admin_note === 'string' ? x.admin_note : null,
      created_at: new Date(x.created_at as string).toISOString(),
      name: String(x.name),
    })),
    counts,
  };
}

/** The owner changes an idea's status and note; false if there's no such idea. */
export async function updateSuggestion(db: Pool, id: number, status: unknown, note: unknown): Promise<boolean | 'bad'> {
  if (!Number.isSafeInteger(id) || id < 1 || !isSuggestionStatus(status)) return 'bad';
  const cleaned = note === undefined || note === null ? '' : cleanText(note, ADMIN_NOTE_MAX);
  if (cleaned === null || [...cleaned].length > ADMIN_NOTE_MAX) return 'bad';
  const r = await db.query('UPDATE suggestion SET status = $2, admin_note = $3 WHERE id = $1', [id, status, cleaned || null]);
  return (r.rowCount ?? 0) > 0;
}
