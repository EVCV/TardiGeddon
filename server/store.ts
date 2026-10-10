// Player data in Postgres (Neon in production): what each player owns, their
// wallet (coins bought with money, Slime earned by playing), stats, and a
// record of every purchase. Better Auth keeps its own tables (user,
// session, account, verification) in the same database.
//
// The server is the only thing that grants items: the game never does.

import type { Pool, PoolClient } from 'pg';
import { coinPack, shopItem } from '../src/shop/catalog';

export async function migrate(db: Pool): Promise<void> {
  await db.query(`
    CREATE TABLE IF NOT EXISTS inventory (
      user_id    text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
      item       text NOT NULL,
      source     text NOT NULL,
      granted_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (user_id, item)
    );
    CREATE TABLE IF NOT EXISTS purchase (
      id             text PRIMARY KEY,
      user_id        text,
      item           text NOT NULL,
      amount         integer NOT NULL,
      currency       text NOT NULL,
      payment_intent text,
      status         text NOT NULL,
      created_at     timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS purchase_payment_intent ON purchase (payment_intent);
    CREATE TABLE IF NOT EXISTS player_stats (
      user_id       text PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,
      online_played integer NOT NULL DEFAULT 0,
      online_won    integer NOT NULL DEFAULT 0,
      updated_at    timestamptz NOT NULL DEFAULT now()
    );
    ALTER TABLE player_stats
      ADD COLUMN IF NOT EXISTS cpu_played     integer NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS cpu_won        integer NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS popped         integer NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS damage         integer NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS streak         integer NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS best_streak    integer NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS self_damage    integer NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS self_popped    integer NOT NULL DEFAULT 0;
    CREATE TABLE IF NOT EXISTS wallet (
      user_id         text PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,
      coins           integer NOT NULL DEFAULT 0,
      slime           integer NOT NULL DEFAULT 0,
      cpu_slime_day   date,
      cpu_slime_today integer NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS stripe_customer (
      user_id     text PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,
      customer_id text NOT NULL UNIQUE
    );
  `);
}

export async function stripeCustomerId(db: Pool, userId: string): Promise<string | null> {
  const r = await db.query<{ customer_id: string }>('SELECT customer_id FROM stripe_customer WHERE user_id = $1', [userId]);
  return r.rows[0]?.customer_id ?? null;
}

/** Remember a player's Stripe customer; if two requests raced, the first one wins. */
export async function setStripeCustomerId(db: Pool, userId: string, customerId: string): Promise<string> {
  await db.query('INSERT INTO stripe_customer (user_id, customer_id) VALUES ($1, $2) ON CONFLICT (user_id) DO NOTHING', [userId, customerId]);
  return (await stripeCustomerId(db, userId)) ?? customerId;
}

/** Delete expired sign-in sessions and one-time verification codes. */
export async function purgeExpired(db: Pool): Promise<void> {
  await db.query('DELETE FROM session WHERE "expiresAt" < now()');
  await db.query('DELETE FROM verification WHERE "expiresAt" < now()');
}

export async function ownedItems(db: Pool, userId: string): Promise<string[]> {
  const r = await db.query<{ item: string }>('SELECT item FROM inventory WHERE user_id = $1 ORDER BY granted_at', [userId]);
  return r.rows.map((x) => x.item);
}

export interface PlayerStats {
  onlinePlayed: number;
  onlineWon: number;
  cpuPlayed: number;
  cpuWon: number;
  /** Enemy tardis popped (killed or drowned) on this player's turns. */
  popped: number;
  /** Damage dealt to enemy tardis. */
  damage: number;
  /** Wins in a row (online and against the CPU), and the best run so far. */
  streak: number;
  bestStreak: number;
  /** Own goals: damage to their own team, and their own tardis popped. */
  selfDamage: number;
  selfPopped: number;
}

export const NO_STATS: PlayerStats = { onlinePlayed: 0, onlineWon: 0, cpuPlayed: 0, cpuWon: 0, popped: 0, damage: 0, streak: 0, bestStreak: 0, selfDamage: 0, selfPopped: 0 };

export async function playerStats(db: Pool, userId: string): Promise<PlayerStats> {
  const r = await db.query(
    `SELECT online_played, online_won, cpu_played, cpu_won, popped, damage, streak, best_streak, self_damage, self_popped
       FROM player_stats WHERE user_id = $1`,
    [userId],
  );
  const x = r.rows[0] as Record<string, number> | undefined;
  if (!x) return { ...NO_STATS };
  return {
    onlinePlayed: x.online_played,
    onlineWon: x.online_won,
    cpuPlayed: x.cpu_played,
    cpuWon: x.cpu_won,
    popped: x.popped,
    damage: x.damage,
    streak: x.streak,
    bestStreak: x.best_streak,
    selfDamage: x.self_damage,
    selfPopped: x.self_popped,
  };
}

/** One finished match for one signed-in player. */
export interface MatchResult {
  userId: string;
  mode: 'online' | 'cpu';
  won: boolean;
  popped: number;
  damage: number;
  selfDamage: number;
  selfPopped: number;
}

/** Add finished matches to the players' stats. */
export async function recordResults(db: Pool, results: MatchResult[]): Promise<void> {
  for (const r of results) {
    const online = r.mode === 'online';
    await db.query(
      `INSERT INTO player_stats AS p
         (user_id, online_played, online_won, cpu_played, cpu_won, popped, damage, self_damage, self_popped, streak, best_streak)
       SELECT $1, $2::int, $3::int, $4::int, $5::int, $6::int, $7::int, $8::int, $9::int, $10::int, $10::int
        WHERE EXISTS (SELECT 1 FROM "user" WHERE id = $1)
       ON CONFLICT (user_id) DO UPDATE SET
         online_played = p.online_played + $2::int,
         online_won    = p.online_won + $3::int,
         cpu_played    = p.cpu_played + $4::int,
         cpu_won       = p.cpu_won + $5::int,
         popped        = p.popped + $6::int,
         damage        = p.damage + $7::int,
         self_damage   = p.self_damage + $8::int,
         self_popped   = p.self_popped + $9::int,
         streak        = CASE WHEN $10::int = 1 THEN p.streak + 1 ELSE 0 END,
         best_streak   = GREATEST(p.best_streak, CASE WHEN $10::int = 1 THEN p.streak + 1 ELSE 0 END),
         updated_at    = now()`,
      [
        r.userId,
        online ? 1 : 0,
        online && r.won ? 1 : 0,
        online ? 0 : 1,
        !online && r.won ? 1 : 0,
        r.popped,
        r.damage,
        r.selfDamage,
        r.selfPopped,
        r.won ? 1 : 0,
      ],
    );
  }
}

export interface PaidCheckout {
  /** Stripe Checkout Session id: makes webhook retries harmless. */
  sessionId: string;
  userId: string;
  item: string;
  amount: number;
  currency: string;
  paymentIntent: string | null;
}

/** Record a completed payment and grant the item. Safe to call twice for the same session. */
export interface Wallet {
  coins: number;
  slime: number;
}

export async function walletOf(db: Pool, userId: string): Promise<Wallet> {
  const r = await db.query<Wallet>('SELECT coins, slime FROM wallet WHERE user_id = $1', [userId]);
  return r.rows[0] ?? { coins: 0, slime: 0 };
}

/** Add (or with a negative amount, take) coins or Slime. Only for the user if they still exist. */
async function credit(c: Pool | PoolClient, userId: string, coins: number, slime: number): Promise<void> {
  await c.query(
    `INSERT INTO wallet (user_id, coins, slime) SELECT $1, $2::int, $3::int WHERE EXISTS (SELECT 1 FROM "user" WHERE id = $1)
     ON CONFLICT (user_id) DO UPDATE SET coins = wallet.coins + $2::int, slime = wallet.slime + $3::int`,
    [userId, coins, slime],
  );
}

/** Slime most players can earn from games against the CPU in one (UTC) day. */
export const CPU_SLIME_PER_DAY = 200;

/** Slime for one finished match (before the daily CPU cap). */
export function slimeFor(r: { mode: 'online' | 'cpu'; won: boolean; popped: number }): number {
  const pops = Math.min(r.popped, 8);
  return r.mode === 'online' ? 20 + (r.won ? 30 : 0) + pops * 5 : 10 + (r.won ? 15 : 0) + pops * 2;
}

/**
 * Pay out a match's Slime. Online matches are counted by the server, so they
 * always pay; games against the CPU are reported by the game, so they're
 * capped per day. Returns the Slime actually given.
 */
export async function earnSlime(db: Pool, r: { userId: string; mode: 'online' | 'cpu'; won: boolean; popped: number }): Promise<number> {
  const want = slimeFor(r);
  if (r.mode === 'online') {
    await credit(db, r.userId, 0, want);
    return want;
  }
  const c = await db.connect();
  try {
    await c.query('BEGIN');
    await c.query(`INSERT INTO wallet (user_id) SELECT $1 WHERE EXISTS (SELECT 1 FROM "user" WHERE id = $1) ON CONFLICT DO NOTHING`, [r.userId]);
    const row = await c.query<{ today: boolean; used: number }>(
      'SELECT cpu_slime_day = current_date AS today, cpu_slime_today AS used FROM wallet WHERE user_id = $1 FOR UPDATE',
      [r.userId],
    );
    if (!row.rows[0]) {
      await c.query('ROLLBACK');
      return 0;
    }
    const used = row.rows[0].today ? row.rows[0].used : 0;
    const give = Math.max(0, Math.min(want, CPU_SLIME_PER_DAY - used));
    await c.query('UPDATE wallet SET slime = slime + $2::int, cpu_slime_day = current_date, cpu_slime_today = $3::int WHERE user_id = $1', [
      r.userId,
      give,
      used + give,
    ]);
    await c.query('COMMIT');
    return give;
  } catch (e) {
    await c.query('ROLLBACK');
    throw e;
  } finally {
    c.release();
  }
}

export type UnlockResult = 'ok' | 'owned' | 'unknown' | 'poor';

/** Spend coins or Slime on a shop item, all or nothing. */
export async function unlockItem(db: Pool, userId: string, itemId: string): Promise<UnlockResult> {
  const item = shopItem(itemId);
  if (!item) return 'unknown';
  const currency = item.coins !== undefined ? 'coins' : 'slime';
  const price = item.coins ?? item.slime ?? 0;
  const c = await db.connect();
  try {
    await c.query('BEGIN');
    const have = await c.query('SELECT 1 FROM inventory WHERE user_id = $1 AND item = $2', [userId, item.id]);
    if (have.rowCount) {
      await c.query('ROLLBACK');
      return 'owned';
    }
    const paid = await c.query(`UPDATE wallet SET ${currency} = ${currency} - $2::int WHERE user_id = $1 AND ${currency} >= $2::int`, [userId, price]);
    if (paid.rowCount !== 1) {
      await c.query('ROLLBACK');
      return 'poor';
    }
    await c.query(`INSERT INTO inventory (user_id, item, source) VALUES ($1, $2, $3)`, [userId, item.id, currency]);
    await c.query('COMMIT');
    return 'ok';
  } catch (e) {
    await c.query('ROLLBACK');
    throw e;
  } finally {
    c.release();
  }
}

/** Record a completed payment and grant what was bought. Safe to call twice for the same session. */
export async function recordPurchase(db: Pool, p: PaidCheckout): Promise<void> {
  const c = await db.connect();
  try {
    await c.query('BEGIN');
    const ins = await c.query(
      `INSERT INTO purchase (id, user_id, item, amount, currency, payment_intent, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'paid') ON CONFLICT (id) DO NOTHING`,
      [p.sessionId, p.userId, p.item, p.amount, p.currency, p.paymentIntent],
    );
    if (ins.rowCount === 1) {
      const pack = coinPack(p.item);
      if (pack) await credit(c, p.userId, pack.coins, 0);
      else {
        // Items sold directly for money before coins existed.
        await c.query(
          `INSERT INTO inventory (user_id, item, source)
           SELECT $1, $2, 'purchase' WHERE EXISTS (SELECT 1 FROM "user" WHERE id = $1)
           ON CONFLICT DO NOTHING`,
          [p.userId, p.item],
        );
      }
    }
    await c.query('COMMIT');
  } catch (e) {
    await c.query('ROLLBACK');
    throw e;
  } finally {
    c.release();
  }
}

/**
 * A refund or chargeback: take back what was bought. Coins are taken back
 * even if already spent (the balance can go below zero, which blocks
 * spending until it's topped up).
 */
export async function revokePurchase(db: Pool, paymentIntent: string, status: 'refunded' | 'disputed'): Promise<void> {
  const r = await db.query<{ user_id: string | null; item: string }>(
    `UPDATE purchase SET status = $2 WHERE payment_intent = $1 AND status = 'paid' RETURNING user_id, item`,
    [paymentIntent, status],
  );
  for (const row of r.rows) {
    if (!row.user_id) continue;
    const pack = coinPack(row.item);
    if (pack) await credit(db, row.user_id, -pack.coins, 0);
    else await db.query(`DELETE FROM inventory WHERE user_id = $1 AND item = $2 AND source = 'purchase'`, [row.user_id, row.item]);
  }
}
