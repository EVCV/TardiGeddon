// Free rewards (src/shop/rewards.ts): inviting friends, and the Founder pack.
//
// Invites: a new player types a friend's code (their friend code) within a
// few days of making their account. Once the new player has confirmed their
// email and played a few matches, both get coins, once: the friend for up to
// INVITE_MAX invites a calendar month. The friend's account must be older than the new one, so
// two new accounts can't invite each other.
//
// Creator codes work the same way, but are worth more to the new player:
// CREATOR_INVITE_COINS and the Superfan pack (FAN_ITEMS); the creator earns a
// share of spend instead (server/creators.ts). Both players are told when the
// reward comes in, once (the invite row's *_seen flags: /api/me's inviteNews).
//
// The Founder pack: accounts made before the launch (FOUNDER_UNTIL), and the
// testers and helpers listed in FOUNDER_EMAILS, get looks that are never sold
// and some coins, the first time they're seen after that. The Early bird pack
// is the same for the first EARLY_BIRD_MAX accounts made up to
// EARLY_BIRD_UNTIL; founders get both.

import type { Pool } from 'pg';
import { normaliseFriendCode, userByCode } from './friends';
import { creatorByCode, joinCreator, normaliseCreatorCode } from './creators';
import { grantFreeCoins } from './store';
import { CREATOR_INVITE_COINS, EARLY_BIRD_COINS, EARLY_BIRD_ITEMS, EARLY_BIRD_MAX, EARLY_BIRD_UNTIL, FAN_ITEMS, FOUNDER_COINS, FOUNDER_ITEMS, FOUNDER_UNTIL, INVITE_COINS, INVITE_DAYS, INVITE_MATCHES, INVITE_MAX } from '../src/shop/rewards';

export async function migrateRewards(db: Pool): Promise<void> {
  await db.query(`
    -- Who invited whom (user_id was invited by inviter_id), and when both were rewarded.
    CREATE TABLE IF NOT EXISTS invite (
      user_id     text PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,
      inviter_id  text REFERENCES "user"(id) ON DELETE SET NULL,
      at          timestamptz NOT NULL DEFAULT now(),
      rewarded_at timestamptz,
      -- Whether the inviter got coins too (not once at INVITE_MAX for that month).
      inviter_paid boolean NOT NULL DEFAULT false
    );
    CREATE INDEX IF NOT EXISTS invite_by_inviter ON invite (inviter_id);
    -- Whether each side has been told about their reward (rows from before these were added: yes).
    ALTER TABLE invite ADD COLUMN IF NOT EXISTS invitee_seen boolean NOT NULL DEFAULT true;
    ALTER TABLE invite ADD COLUMN IF NOT EXISTS inviter_seen boolean NOT NULL DEFAULT true;
    -- Founder and Early bird packs given (once each).
    CREATE TABLE IF NOT EXISTS founder (
      user_id text PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,
      at      timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS early_bird (
      user_id text PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,
      at      timestamptz NOT NULL DEFAULT now()
    );
    -- Each account's place in the queue of sign-ups (1st, 2nd…), for "the first
    -- EARLY_BIRD_MAX accounts". Numbers are never reused, so deleting an account
    -- doesn't move anyone up the queue.
    CREATE TABLE IF NOT EXISTS signup_order (
      user_id text PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,
      n       bigserial UNIQUE
    );
  `);
  // Accounts made before this table (or while the server was down) join the queue in the order they were made.
  await db.query(
    `INSERT INTO signup_order (user_id)
     SELECT id FROM "user" u WHERE NOT EXISTS (SELECT 1 FROM signup_order s WHERE s.user_id = u.id) ORDER BY "createdAt", id
     ON CONFLICT DO NOTHING`,
  );
}

export type InviteResult = 'ok' | 'unknown' | 'self' | 'already' | 'late' | 'newer';

/**
 * A new player says who invited them: a friend's code, or a creator's code
 * (server/creators.ts; the new player gets the same reward, and the creator a
 * share of what they spend instead of coins).
 */
export async function enterInvite(db: Pool, userId: string, code: string, now = Date.now()): Promise<InviteResult> {
  const me = await db.query<{ createdAt: Date }>('SELECT "createdAt" FROM "user" WHERE id = $1', [userId]);
  if (!me.rows[0]) return 'unknown';
  if (now - new Date(me.rows[0].createdAt).getTime() > INVITE_DAYS * 86_400_000) return 'late';
  const creator = await creatorByCode(db, code);
  if (creator) {
    if (creator.userId === userId) return 'self';
    const r = await db.query('INSERT INTO invite (user_id, inviter_id, invitee_seen, inviter_seen) VALUES ($1, NULL, false, false) ON CONFLICT DO NOTHING', [userId]);
    if (!r.rowCount) return 'already';
    await joinCreator(db, userId, creator.code);
    await settleInvite(db, userId);
    return 'ok';
  }
  const friend = normaliseFriendCode(code);
  const inviter = friend ? await userByCode(db, friend) : null;
  if (!inviter) return 'unknown';
  if (inviter === userId) return 'self';
  const them = await db.query<{ createdAt: Date }>('SELECT "createdAt" FROM "user" WHERE id = $1', [inviter]);
  if (!them.rows[0] || new Date(them.rows[0].createdAt) >= new Date(me.rows[0].createdAt)) return 'newer';
  const r = await db.query('INSERT INTO invite (user_id, inviter_id, invitee_seen, inviter_seen) VALUES ($1, $2, false, false) ON CONFLICT DO NOTHING', [userId, inviter]);
  if (!r.rowCount) return 'already';
  await settleInvite(db, userId);
  return 'ok';
}

/**
 * Pay an invite once its new player has confirmed their email and played
 * enough matches. Safe to call any time, and twice at once: only one pays.
 * Returns the coins this player got (0 if nothing happened).
 */
export async function settleInvite(db: Pool, userId: string): Promise<number> {
  const due = await db.query(
    `SELECT i.inviter_id FROM invite i
       JOIN "user" u ON u.id = i.user_id
       LEFT JOIN player_stats p ON p.user_id = i.user_id
      WHERE i.user_id = $1 AND i.rewarded_at IS NULL AND u."emailVerified"
        AND coalesce(p.online_played, 0) + coalesce(p.cpu_played, 0) >= $2`,
    [userId, INVITE_MATCHES],
  );
  if (!due.rows[0]) return 0;
  const c = await db.connect();
  try {
    await c.query('BEGIN');
    const claim = await c.query<{ inviter_id: string | null }>(
      'UPDATE invite SET rewarded_at = now() WHERE user_id = $1 AND rewarded_at IS NULL RETURNING inviter_id',
      [userId],
    );
    const inviter = claim.rows[0]?.inviter_id;
    if (claim.rowCount !== 1) {
      await c.query('ROLLBACK');
      return 0;
    }
    // A creator's code: more coins, and the Superfan pack.
    const viaCreator = !inviter && (await c.query('SELECT 1 FROM creator_player WHERE user_id = $1', [userId])).rowCount === 1;
    const coins = viaCreator ? CREATOR_INVITE_COINS : INVITE_COINS;
    await grantFreeCoins(c, userId, coins);
    if (viaCreator) {
      for (const item of FAN_ITEMS) await c.query('INSERT INTO inventory (user_id, item, source) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING', [userId, item, 'creator']);
    }
    if (inviter) {
      // One at a time per inviter, so two friends finishing at once can't both be the tenth.
      await c.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`invite:${inviter}`]);
      const paid = await c.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM invite WHERE inviter_id = $1 AND inviter_paid AND rewarded_at >= date_trunc('month', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'`,
        [inviter],
      );
      if (paid.rows[0].n < INVITE_MAX) {
        await grantFreeCoins(c, inviter, INVITE_COINS);
        await c.query('UPDATE invite SET inviter_paid = true WHERE user_id = $1', [userId]);
      }
    }
    await c.query('COMMIT');
    return coins;
  } catch (e) {
    await c.query('ROLLBACK');
    throw e;
  } finally {
    c.release();
  }
}

/** What the Account page shows about invites. */
export interface InviteStatus {
  /** Friends who joined with this player's code and earned this player coins this month (UTC). */
  rewarded: number;
  /** ...and in all. */
  rewardedEver: number;
  /** Friends who joined with the code but haven't confirmed their email or played enough yet. */
  waiting: number;
  /** Whether this player was invited, and whether that's been rewarded yet. */
  invited: 'no' | 'waiting' | 'rewarded';
  /** Whether a friend's code can still be entered. */
  canEnter: boolean;
  /** Invited: the coins this player gets (more with a creator's code), the creator's name if it was one, and matches played so far (of INVITE_MATCHES). */
  reward?: number;
  creator?: string;
  played?: number;
}

export async function inviteStatus(db: Pool, userId: string, createdAt: string, now = Date.now()): Promise<InviteStatus> {
  const mine = await db.query<{ rewarded: number; ever: number; waiting: number }>(
    `SELECT count(*) FILTER (WHERE inviter_paid AND rewarded_at >= date_trunc('month', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')::int AS rewarded,
            count(*) FILTER (WHERE inviter_paid)::int AS ever,
            count(*) FILTER (WHERE rewarded_at IS NULL)::int AS waiting
       FROM invite WHERE inviter_id = $1`,
    [userId],
  );
  const own = await db.query<{ rewarded_at: Date | null; creator: string | null; played: number }>(
    `SELECT i.rewarded_at, c.name AS creator, (coalesce(p.online_played, 0) + coalesce(p.cpu_played, 0))::int AS played
       FROM invite i
       LEFT JOIN creator_player cp ON cp.user_id = i.user_id
       LEFT JOIN creator c ON c.code = cp.code
       LEFT JOIN player_stats p ON p.user_id = i.user_id
      WHERE i.user_id = $1`,
    [userId],
  );
  const row = own.rows[0];
  const invited = !row ? 'no' : row.rewarded_at ? 'rewarded' : 'waiting';
  const young = now - new Date(createdAt).getTime() <= INVITE_DAYS * 86_400_000;
  return {
    rewarded: mine.rows[0].rewarded,
    rewardedEver: mine.rows[0].ever,
    waiting: mine.rows[0].waiting,
    invited,
    canEnter: invited === 'no' && young,
    ...(row ? { reward: row.creator ? CREATOR_INVITE_COINS : INVITE_COINS, played: Math.min(INVITE_MATCHES, row.played), ...(row.creator ? { creator: row.creator } : {}) } : {}),
  };
}

/** Rewards that came in since this player last looked: friends who joined with their code, and their own. */
export interface InviteNews {
  /** Friends whose reward just paid this player too, and the coins it brought. */
  friends: number;
  coins: number;
  /** This player's own reward for joining with a code. */
  mine?: { coins: number; items: string[]; creator?: string };
}

/** What's new about invites for this player, marked as told (so each is said once). Null if nothing. */
export async function inviteNews(db: Pool, userId: string): Promise<InviteNews | null> {
  const friends = await db.query('UPDATE invite SET inviter_seen = true WHERE inviter_id = $1 AND inviter_paid AND NOT inviter_seen RETURNING 1', [userId]);
  const own = await db.query<{ creator: string | null }>(
    `UPDATE invite SET invitee_seen = true
      WHERE user_id = $1 AND rewarded_at IS NOT NULL AND NOT invitee_seen
      RETURNING (SELECT c.name FROM creator_player cp JOIN creator c ON c.code = cp.code WHERE cp.user_id = invite.user_id) AS creator`,
    [userId],
  );
  const n = friends.rowCount ?? 0;
  const mine = own.rows[0];
  if (!n && !mine) return null;
  return {
    friends: n,
    coins: n * INVITE_COINS,
    ...(mine ? { mine: mine.creator ? { coins: CREATOR_INVITE_COINS, items: FAN_ITEMS, creator: mine.creator } : { coins: INVITE_COINS, items: [] } } : {}),
  };
}

/** What a code from an invite link is worth, before the player has an account (no names of players are given out). */
export type InvitePeek = { kind: 'creator'; name: string; coins: number; items: string[] } | { kind: 'friend'; coins: number } | { kind: 'unknown' };

export async function peekInvite(db: Pool, code: unknown): Promise<InvitePeek> {
  const c = normaliseCreatorCode(code);
  if (!c) return { kind: 'unknown' };
  const creator = await db.query<{ name: string }>('SELECT name FROM creator WHERE code = $1 AND active', [c]);
  if (creator.rows[0]) return { kind: 'creator', name: creator.rows[0].name, coins: CREATOR_INVITE_COINS, items: FAN_ITEMS };
  const friend = normaliseFriendCode(typeof code === 'string' ? code : '');
  if (friend && (await userByCode(db, friend))) return { kind: 'friend', coins: INVITE_COINS };
  return { kind: 'unknown' };
}

/** Who gets the Founder pack: the day accounts must be made by (UTC, inclusive) and the emails always in. */
export interface FounderRule {
  until: string;
  emails: Set<string>;
}

export function founderRule(env: { FOUNDER_UNTIL?: string; FOUNDER_EMAILS?: string }): FounderRule {
  const until = env.FOUNDER_UNTIL && /^\d{4}-\d{2}-\d{2}$/.test(env.FOUNDER_UNTIL) ? env.FOUNDER_UNTIL : FOUNDER_UNTIL;
  const emails = new Set((env.FOUNDER_EMAILS ?? '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean));
  return { until, emails };
}

/** Is this account a founder? (A listed email counts once it's confirmed, so nobody can sign up as it.) */
export function isFounder(rule: FounderRule, user: { email: string; emailVerified?: boolean; createdAt: string }): boolean {
  if (user.emailVerified && rule.emails.has(user.email.toLowerCase())) return true;
  return new Date(user.createdAt).getTime() < Date.parse(rule.until) + 86_400_000;
}

/** Who gets the Early bird pack: accounts made up to this day (UTC, inclusive), and only the first `max` of them (0: no limit). */
export interface EarlyBirdRule {
  until: string;
  max: number;
}

export function earlyBirdRule(env: { EARLY_BIRD_UNTIL?: string; EARLY_BIRD_MAX?: string }): EarlyBirdRule {
  const until = env.EARLY_BIRD_UNTIL && /^\d{4}-\d{2}-\d{2}$/.test(env.EARLY_BIRD_UNTIL) ? env.EARLY_BIRD_UNTIL : EARLY_BIRD_UNTIL;
  const n = Number(env.EARLY_BIRD_MAX);
  return { until, max: env.EARLY_BIRD_MAX !== undefined && Number.isInteger(n) && n >= 0 ? n : EARLY_BIRD_MAX };
}

/** Is this account an early bird: made in time, and among the first `max` accounts ever made (signup_order)? */
export async function isEarlyBird(db: Pool, rule: EarlyBirdRule, user: { id: string; createdAt: string }): Promise<boolean> {
  // Every account takes its place in the queue the first time it's seen (straight after signing up), early bird or not.
  const n = await signupNumber(db, user.id);
  if (new Date(user.createdAt).getTime() >= Date.parse(rule.until) + 86_400_000) return false;
  return !rule.max || n <= rule.max;
}

/** This account's place in the queue of sign-ups (1 for the first), given the first time it's asked for. */
export async function signupNumber(db: Pool, userId: string): Promise<number> {
  await db.query('INSERT INTO signup_order (user_id) SELECT $1 WHERE EXISTS (SELECT 1 FROM "user" WHERE id = $1) ON CONFLICT DO NOTHING', [userId]);
  const r = await db.query<{ n: string }>('SELECT n FROM signup_order WHERE user_id = $1', [userId]);
  return r.rows[0] ? Number(r.rows[0].n) : Infinity;
}

/** Give a pack (its looks and free coins) once, recorded in `table`. True if it was given just now. */
async function grantPack(db: Pool, table: 'founder' | 'early_bird', userId: string, items: string[], coins: number): Promise<boolean> {
  const c = await db.connect();
  try {
    await c.query('BEGIN');
    const r = await c.query(`INSERT INTO ${table} (user_id) SELECT $1 WHERE EXISTS (SELECT 1 FROM "user" WHERE id = $1) ON CONFLICT DO NOTHING`, [userId]);
    if (r.rowCount !== 1) {
      await c.query('ROLLBACK');
      return false;
    }
    for (const item of items) {
      await c.query(`INSERT INTO inventory (user_id, item, source) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`, [userId, item, table === 'founder' ? 'founder' : 'earlybird']);
    }
    await grantFreeCoins(c, userId, coins);
    await c.query('COMMIT');
    return true;
  } catch (e) {
    await c.query('ROLLBACK');
    throw e;
  } finally {
    c.release();
  }
}

/** Give a founder their pack, once. True if it was given just now. */
export function grantFounder(db: Pool, userId: string): Promise<boolean> {
  return grantPack(db, 'founder', userId, FOUNDER_ITEMS, FOUNDER_COINS);
}

/** Give an early bird (or a founder) the Early bird pack, once. True if it was given just now. */
export function grantEarlyBird(db: Pool, userId: string): Promise<boolean> {
  return grantPack(db, 'early_bird', userId, EARLY_BIRD_ITEMS, EARLY_BIRD_COINS);
}

/** Is this account an active creator (server/creators.ts)? They show a ⭐ and may use the creator medal emblem. */
export async function isCreator(db: Pool, userId: string): Promise<boolean> {
  return (await db.query('SELECT 1 FROM creator WHERE user_id = $1 AND active', [userId])).rowCount === 1;
}

/** The badge an account shows: 🌱 founder, else 🐣 early bird. */
export async function packBadge(db: Pool, userId: string): Promise<'founder' | 'earlybird' | null> {
  const r = await db.query<{ f: boolean; e: boolean }>(
    'SELECT EXISTS (SELECT 1 FROM founder WHERE user_id = $1) AS f, EXISTS (SELECT 1 FROM early_bird WHERE user_id = $1) AS e',
    [userId],
  );
  return r.rows[0].f ? 'founder' : r.rows[0].e ? 'earlybird' : null;
}
