// Free rewards (src/shop/rewards.ts): inviting friends, and the Founder pack.
//
// Invites: a new player types a friend's code (their friend code) within a
// few days of making their account. Once the new player has confirmed their
// email and played a few matches, both get coins, once: the friend for up to
// INVITE_MAX invites. The friend's account must be older than the new one, so
// two new accounts can't invite each other.
//
// The Founder pack: accounts made before the launch (FOUNDER_UNTIL), and the
// testers and helpers listed in FOUNDER_EMAILS, get looks that are never sold
// and some coins, the first time they're seen after that.

import type { Pool } from 'pg';
import { userByCode } from './friends';
import { grantFreeCoins } from './store';
import { FOUNDER_COINS, FOUNDER_ITEMS, FOUNDER_UNTIL, INVITE_COINS, INVITE_DAYS, INVITE_MATCHES, INVITE_MAX } from '../src/shop/rewards';

export async function migrateRewards(db: Pool): Promise<void> {
  await db.query(`
    -- Who invited whom (user_id was invited by inviter_id), and when both were rewarded.
    CREATE TABLE IF NOT EXISTS invite (
      user_id     text PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,
      inviter_id  text REFERENCES "user"(id) ON DELETE SET NULL,
      at          timestamptz NOT NULL DEFAULT now(),
      rewarded_at timestamptz,
      -- The inviter was already at INVITE_MAX: only the new player got coins.
      inviter_paid boolean NOT NULL DEFAULT false
    );
    CREATE INDEX IF NOT EXISTS invite_by_inviter ON invite (inviter_id);
    -- Founder packs given (once each).
    CREATE TABLE IF NOT EXISTS founder (
      user_id text PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,
      at      timestamptz NOT NULL DEFAULT now()
    );
  `);
}

export type InviteResult = 'ok' | 'unknown' | 'self' | 'already' | 'late' | 'newer';

/** A new player says who invited them, by the friend's code. */
export async function enterInvite(db: Pool, userId: string, code: string, now = Date.now()): Promise<InviteResult> {
  const me = await db.query<{ createdAt: Date }>('SELECT "createdAt" FROM "user" WHERE id = $1', [userId]);
  if (!me.rows[0]) return 'unknown';
  if (now - new Date(me.rows[0].createdAt).getTime() > INVITE_DAYS * 86_400_000) return 'late';
  const inviter = await userByCode(db, code);
  if (!inviter) return 'unknown';
  if (inviter === userId) return 'self';
  const them = await db.query<{ createdAt: Date }>('SELECT "createdAt" FROM "user" WHERE id = $1', [inviter]);
  if (!them.rows[0] || new Date(them.rows[0].createdAt) >= new Date(me.rows[0].createdAt)) return 'newer';
  const r = await db.query('INSERT INTO invite (user_id, inviter_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [userId, inviter]);
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
    await grantFreeCoins(c, userId, INVITE_COINS);
    if (inviter) {
      // One at a time per inviter, so two friends finishing at once can't both be the tenth.
      await c.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`invite:${inviter}`]);
      const paid = await c.query<{ n: number }>('SELECT count(*)::int AS n FROM invite WHERE inviter_id = $1 AND inviter_paid', [inviter]);
      if (paid.rows[0].n < INVITE_MAX) {
        await grantFreeCoins(c, inviter, INVITE_COINS);
        await c.query('UPDATE invite SET inviter_paid = true WHERE user_id = $1', [userId]);
      }
    }
    await c.query('COMMIT');
    return INVITE_COINS;
  } catch (e) {
    await c.query('ROLLBACK');
    throw e;
  } finally {
    c.release();
  }
}

/** What the Account page shows about invites. */
export interface InviteStatus {
  /** Friends who joined with this player's code and have been rewarded (coins paid to this player). */
  rewarded: number;
  /** Friends who joined with the code but haven't confirmed their email or played enough yet. */
  waiting: number;
  /** Whether this player was invited, and whether that's been rewarded yet. */
  invited: 'no' | 'waiting' | 'rewarded';
  /** Whether a friend's code can still be entered. */
  canEnter: boolean;
}

export async function inviteStatus(db: Pool, userId: string, createdAt: string, now = Date.now()): Promise<InviteStatus> {
  const mine = await db.query<{ rewarded: number; waiting: number }>(
    `SELECT count(*) FILTER (WHERE inviter_paid)::int AS rewarded, count(*) FILTER (WHERE rewarded_at IS NULL)::int AS waiting
       FROM invite WHERE inviter_id = $1`,
    [userId],
  );
  const own = await db.query<{ rewarded_at: Date | null }>('SELECT rewarded_at FROM invite WHERE user_id = $1', [userId]);
  const invited = !own.rows[0] ? 'no' : own.rows[0].rewarded_at ? 'rewarded' : 'waiting';
  const young = now - new Date(createdAt).getTime() <= INVITE_DAYS * 86_400_000;
  return { rewarded: mine.rows[0].rewarded, waiting: mine.rows[0].waiting, invited, canEnter: invited === 'no' && young };
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

/** Give a founder their pack, once. True if it was given just now. */
export async function grantFounder(db: Pool, userId: string): Promise<boolean> {
  const c = await db.connect();
  try {
    await c.query('BEGIN');
    const r = await c.query('INSERT INTO founder (user_id) SELECT $1 WHERE EXISTS (SELECT 1 FROM "user" WHERE id = $1) ON CONFLICT DO NOTHING', [userId]);
    if (r.rowCount !== 1) {
      await c.query('ROLLBACK');
      return false;
    }
    for (const item of FOUNDER_ITEMS) {
      await c.query(`INSERT INTO inventory (user_id, item, source) VALUES ($1, $2, 'founder') ON CONFLICT DO NOTHING`, [userId, item]);
    }
    await grantFreeCoins(c, userId, FOUNDER_COINS);
    await c.query('COMMIT');
    return true;
  } catch (e) {
    await c.query('ROLLBACK');
    throw e;
  } finally {
    c.release();
  }
}

/** Has this account had its Founder pack? (For the badge.) */
export async function hasFounderPack(db: Pool, userId: string): Promise<boolean> {
  return !!(await db.query('SELECT 1 FROM founder WHERE user_id = $1', [userId])).rows[0];
}
