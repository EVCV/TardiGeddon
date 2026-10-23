// Player data in Postgres (Neon in production): what each player owns, their
// wallet (coins bought with money, Slime earned by playing), stats, and a
// record of every purchase. Better Auth keeps its own tables (user,
// session, account, verification) in the same database.
//
// A wallet's coins are also kept as "lots": where each batch came from (a
// payment, its bonus, or from before lots existed), the buyer's country and
// what it cost. Spending takes free coins first, then the oldest paid ones.
// That's for Japan's Payment Services Act, which counts the unspent paid
// coins held by players there (coinLiability; docs/GOOGLE_PLAY.md).
//
// The server is the only thing that grants items: the game never does.

import type { Pool, PoolClient } from 'pg';
import { START_RATING, newRatings } from '../src/stats/rank';
import { createHash, randomInt } from 'node:crypto';
import { GIFTS_PER_DAY, GIFT_ALPHABET, GIFT_MESSAGES, SHOP_ITEMS, bundle, bundlePrice, coinPack, giftable, normaliseGiftCode, packTotal, shopItem } from '../src/shop/catalog';
import type { GiftSent, SalesReport } from '../src/account/session';
import { sanitiseControls, type Controls } from '../src/input/controls';
import { DEFAULT_JPY_PER_GBP, JAPAN_ALERTS, JAPAN_LIMIT_YEN, japanLevelsReached, japanYen, type UnspentRow } from '../src/shop/japan';

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
    -- Coins a coin-pack payment gave, bonus included (taken back exactly on a refund).
    ALTER TABLE purchase ADD COLUMN IF NOT EXISTS coins integer;
    -- When a refund or chargeback happened, so the sales page counts it on that day.
    ALTER TABLE purchase ADD COLUMN IF NOT EXISTS refunded_at timestamptz;
    -- Coin packs bought before bonus coins existed gave exactly their base amount (the number in the id).
    UPDATE purchase SET coins = split_part(item, ':', 2)::int WHERE coins IS NULL AND item ~ '^coins:[0-9]+$';
    -- The buyer's country (ISO code, from Stripe or Google), when known.
    ALTER TABLE purchase ADD COLUMN IF NOT EXISTS region text;
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
      ADD COLUMN IF NOT EXISTS self_popped    integer NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS rating         integer NOT NULL DEFAULT 1000,
      ADD COLUMN IF NOT EXISTS rated_games    integer NOT NULL DEFAULT 0;
    CREATE TABLE IF NOT EXISTS wallet (
      user_id         text PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,
      coins           integer NOT NULL DEFAULT 0,
      slime           integer NOT NULL DEFAULT 0,
      cpu_slime_day   date,
      cpu_slime_today integer NOT NULL DEFAULT 0
    );
    -- Every coin or Slime spend, a bundle as one row, for the owner's sales page.
    -- Deliberately not linked to the player: only totals are ever needed.
    CREATE TABLE IF NOT EXISTS spend (
      id       bigserial PRIMARY KEY,
      item     text NOT NULL,
      currency text NOT NULL,
      amount   integer NOT NULL,
      at       timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS spend_at ON spend (at);
    -- Gifts: bought with the sender's coins, claimed once with a code. Only a
    -- hash of the code is kept, so the table alone can't be used to claim them.
    CREATE TABLE IF NOT EXISTS gift (
      id           bigserial PRIMARY KEY,
      code_hash    text NOT NULL UNIQUE,
      hint         text NOT NULL,
      item         text NOT NULL,
      coins        integer NOT NULL,
      message      text NOT NULL DEFAULT 'none',
      from_user    text REFERENCES "user"(id) ON DELETE SET NULL,
      to_user      text REFERENCES "user"(id) ON DELETE SET NULL,
      spend_id     bigint,
      created_at   timestamptz NOT NULL DEFAULT now(),
      redeemed_at  timestamptz,
      cancelled_at timestamptz
    );
    CREATE INDEX IF NOT EXISTS gift_from ON gift (from_user, created_at);
    -- Where a wallet's coins came from (see the top of this file). The lots'
    -- left_coins add up to the wallet's coins (or 0 while it's below zero).
    CREATE TABLE IF NOT EXISTS coin_lot (
      id          bigserial PRIMARY KEY,
      user_id     text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
      -- The payment they came from (purchase.id); null if not bought.
      purchase_id text,
      -- Bought with money (false: bonus coins, test purchases, coins from before lots).
      paid        boolean NOT NULL,
      region      text,
      coins       integer NOT NULL,
      -- What they cost, in the currency's smallest unit (pence), 0 if free.
      value       integer NOT NULL DEFAULT 0,
      currency    text,
      left_coins  integer NOT NULL,
      -- Refunded or charged back: these coins went with the money.
      revoked     boolean NOT NULL DEFAULT false,
      created_at  timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS coin_lot_user ON coin_lot (user_id) WHERE left_coins > 0;
    CREATE INDEX IF NOT EXISTS coin_lot_purchase ON coin_lot (purchase_id);
    -- Which lots a gift's coins came from, so cancelling it puts them back.
    ALTER TABLE gift ADD COLUMN IF NOT EXISTS lots jsonb;
    -- One-off data jobs that have run, so they never run twice.
    CREATE TABLE IF NOT EXISTS done_once (
      name text PRIMARY KEY,
      at   timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS stripe_customer (
      user_id     text PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,
      customer_id text NOT NULL UNIQUE
    );
    -- The player's control settings (keys, mouse buttons, touch pads), checked by sanitiseControls.
    CREATE TABLE IF NOT EXISTS player_settings (
      user_id    text PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,
      controls   jsonb NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    -- Signing in to the Android app in a browser tab (Apple): the one-time
    -- token that hands the sign-in back to the app, and the challenge only the
    -- app that asked can answer. Both hashed; gone in minutes (purgeExpired).
    CREATE TABLE IF NOT EXISTS app_signin (
      token_hash text PRIMARY KEY,
      challenge  text NOT NULL,
      expires_at timestamptz NOT NULL
    );
  `);
  await backfillSpends(db);
  await backfillLots(db);
}

/**
 * Coins already in wallets when lots began: one free lot each, of unknown
 * country (no shop was open in Japan before then).
 */
async function backfillLots(db: Pool): Promise<void> {
  const c = await db.connect();
  try {
    await c.query('BEGIN');
    await c.query("SELECT pg_advisory_xact_lock(hashtext('coin_lots_backfill'))");
    const done = await c.query(`SELECT 1 FROM done_once WHERE name = 'coin_lots_backfill'`);
    if (!done.rowCount) {
      await c.query(
        `INSERT INTO coin_lot (user_id, paid, coins, left_coins)
         SELECT w.user_id, false, w.coins, w.coins FROM wallet w
         WHERE w.coins > 0 AND NOT EXISTS (SELECT 1 FROM coin_lot l WHERE l.user_id = w.user_id)`,
      );
      await c.query(`INSERT INTO done_once (name) VALUES ('coin_lots_backfill')`);
    }
    await c.query('COMMIT');
  } catch (e) {
    await c.query('ROLLBACK');
    throw e;
  } finally {
    c.release();
  }
}

/** Coins taken from one lot. */
interface LotUse {
  id: string;
  n: number;
}

/**
 * Make the lots add up to the wallet again after it changed: coins spent (or
 * taken back) come off the lots, free coins first, then the oldest paid ones;
 * coins that appeared from nowhere (e.g. added by hand) become a free lot.
 * Returns what was taken. Call inside the transaction that changed the wallet.
 */
async function settleLots(c: PoolClient, userId: string): Promise<LotUse[]> {
  const w = await c.query<{ coins: number }>('SELECT coins FROM wallet WHERE user_id = $1', [userId]);
  const target = Math.max(0, w.rows[0]?.coins ?? 0);
  const lots = await c.query<{ id: string; left_coins: number }>(
    'SELECT id, left_coins FROM coin_lot WHERE user_id = $1 AND left_coins > 0 ORDER BY paid, created_at, id FOR UPDATE',
    [userId],
  );
  const have = lots.rows.reduce((a, l) => a + l.left_coins, 0);
  if (have < target) {
    if (w.rows.length) await c.query('INSERT INTO coin_lot (user_id, paid, coins, left_coins) VALUES ($1, false, $2, $2)', [userId, target - have]);
    return [];
  }
  const used: LotUse[] = [];
  let extra = have - target;
  for (const l of lots.rows) {
    if (extra <= 0) break;
    const n = Math.min(extra, l.left_coins);
    await c.query('UPDATE coin_lot SET left_coins = left_coins - $2 WHERE id = $1', [l.id, n]);
    used.push({ id: l.id, n });
    extra -= n;
  }
  return used;
}

/**
 * Unlocks from before the spend log existed: count each one at today's
 * price (bundles bought then show as their separate items).
 */
async function backfillSpends(db: Pool): Promise<void> {
  const priced = SHOP_ITEMS.flatMap((i) => [
    ...(i.coins !== undefined ? [{ item: i.id, currency: 'coins', price: i.coins }] : []),
    ...(i.slime !== undefined ? [{ item: i.id, currency: 'slime', price: i.slime }] : []),
  ]);
  const c = await db.connect();
  try {
    await c.query('BEGIN');
    // One server at a time, all of it or none, and only ever once: after that the
    // log may be emptied on purpose (a fresh start for the sales page) and must stay so.
    await c.query("SELECT pg_advisory_xact_lock(hashtext('spend_backfill'))");
    const done = await c.query(`SELECT 1 FROM done_once WHERE name = 'spend_backfill'`);
    // A log with rows came from a server from before done_once: it already ran.
    const logged = done.rowCount ? done : await c.query('SELECT 1 FROM spend LIMIT 1');
    if (!logged.rowCount) {
      await c.query(
        `INSERT INTO spend (item, currency, amount, at)
         SELECT i.item, i.source, p.price, i.granted_at
         FROM inventory i
         JOIN unnest($1::text[], $2::text[], $3::int[]) AS p(item, currency, price) ON p.item = i.item AND p.currency = i.source`,
        [priced.map((p) => p.item), priced.map((p) => p.currency), priced.map((p) => p.price)],
      );
    }
    await c.query(`INSERT INTO done_once (name) VALUES ('spend_backfill') ON CONFLICT DO NOTHING`);
    await c.query('COMMIT');
  } catch (e) {
    await c.query('ROLLBACK');
    throw e;
  } finally {
    c.release();
  }
}

/** The player's saved control settings, or null if they've never saved any. */
export async function controlsOf(db: Pool, userId: string): Promise<Controls | null> {
  const r = await db.query<{ controls: unknown }>('SELECT controls FROM player_settings WHERE user_id = $1', [userId]);
  return r.rows.length ? sanitiseControls(r.rows[0].controls) : null;
}

export async function saveControlsFor(db: Pool, userId: string, controls: Controls): Promise<void> {
  await db.query(
    `INSERT INTO player_settings (user_id, controls) VALUES ($1, $2)
     ON CONFLICT (user_id) DO UPDATE SET controls = EXCLUDED.controls, updated_at = now()`,
    [userId, JSON.stringify(controls)],
  );
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
  await db.query('DELETE FROM app_signin WHERE expires_at < now()');
}

/** Remember which app asked for a sign-in handed over with `tokenHash` (see takeAppSignIn). */
export async function saveAppSignIn(db: Pool, tokenHash: string, challenge: string, minutes: number): Promise<void> {
  await db.query(`INSERT INTO app_signin (token_hash, challenge, expires_at) VALUES ($1, $2, now() + make_interval(mins => $3))`, [tokenHash, challenge, minutes]);
}

/** The challenge for a handed-over sign-in, used up (once only), or null if unknown or expired. */
export async function takeAppSignIn(db: Pool, tokenHash: string): Promise<string | null> {
  const r = await db.query<{ challenge: string }>('DELETE FROM app_signin WHERE token_hash = $1 AND expires_at > now() RETURNING challenge', [tokenHash]);
  return r.rows[0]?.challenge ?? null;
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
  /** Quick-play rating (src/stats/rank.ts) and how many rated matches it's from. */
  rating: number;
  ratedGames: number;
}

export const NO_STATS: PlayerStats = { onlinePlayed: 0, onlineWon: 0, cpuPlayed: 0, cpuWon: 0, popped: 0, damage: 0, streak: 0, bestStreak: 0, selfDamage: 0, selfPopped: 0, rating: START_RATING, ratedGames: 0 };

export async function playerStats(db: Pool, userId: string): Promise<PlayerStats> {
  const r = await db.query(
    `SELECT online_played, online_won, cpu_played, cpu_won, popped, damage, streak, best_streak, self_damage, self_popped, rating, rated_games
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
    rating: x.rating,
    ratedGames: x.rated_games,
  };
}

/** Players' quick-play ratings (new players start at START_RATING). */
export async function ratingsOf(db: Pool, userIds: string[]): Promise<Map<string, { rating: number; rated: number }>> {
  const r = await db.query('SELECT user_id, rating, rated_games FROM player_stats WHERE user_id = ANY($1)', [userIds]);
  const out = new Map(userIds.map((id) => [id, { rating: START_RATING, rated: 0 }]));
  for (const x of r.rows) out.set(x.user_id, { rating: x.rating, rated: x.rated_games });
  return out;
}

/**
 * A ranked (quick-play) match between signed-in players: everyone's new
 * rating. Call after recordResults, so each player has a stats row.
 */
export async function rateMatch(db: Pool, results: MatchResult[]): Promise<void> {
  const ids = results.map((r) => r.userId);
  if (new Set(ids).size < 2) return;
  const now = await ratingsOf(db, ids);
  const players = ids.map((id) => now.get(id)!);
  const after = newRatings(players, results.findIndex((r) => r.won));
  for (let i = 0; i < ids.length; i++) {
    await db.query('UPDATE player_stats SET rating = $2, rated_games = rated_games + 1 WHERE user_id = $1', [ids[i], after[i]]);
  }
}

/** One finished match for one signed-in player. */
export interface MatchResult {
  userId: string;
  mode: 'online' | 'cpu';
  /**
   * Which Slime rate applies, if not the mode's: an online match only pays the
   * online rate when two or more different accounts played each other;
   * otherwise it pays like a CPU game, under the daily cap.
   */
  slime?: 'online' | 'cpu';
  won: boolean;
  popped: number;
  damage: number;
  selfDamage: number;
  selfPopped: number;
  /** A quick-play match between signed-in players: it changes their ratings. */
  ranked?: boolean;
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
  /** The buyer's country (ISO 3166 code), if the payment says. */
  region?: string | null;
}

/** A country code as we keep it: two capital letters, or null. */
export function cleanRegion(v: unknown): string | null {
  return typeof v === 'string' && /^[A-Za-z]{2}$/.test(v) ? v.toUpperCase() : null;
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
export async function earnSlime(db: Pool, r: { userId: string; mode: 'online' | 'cpu'; slime?: 'online' | 'cpu'; won: boolean; popped: number }): Promise<number> {
  const rate = r.slime ?? r.mode;
  const want = slimeFor({ ...r, mode: rate });
  if (rate === 'online') {
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
    await c.query('INSERT INTO spend (item, currency, amount) VALUES ($1, $2, $3)', [item.id, currency, price]);
    if (currency === 'coins') await settleLots(c, userId);
    await c.query('COMMIT');
    return 'ok';
  } catch (e) {
    await c.query('ROLLBACK');
    throw e;
  } finally {
    c.release();
  }
}

/**
 * Unlock every item in a bundle the player doesn't own yet, for the bundle's
 * price on what's left (bundlePrice), all at once or not at all.
 */
export async function unlockBundle(db: Pool, userId: string, bundleId: string): Promise<UnlockResult> {
  const b = bundle(bundleId);
  if (!b) return 'unknown';
  const c = await db.connect();
  try {
    await c.query('BEGIN');
    // Lock the wallet first, so two bundle buys can't both price against the same inventory.
    await c.query('SELECT 1 FROM wallet WHERE user_id = $1 FOR UPDATE', [userId]);
    const have = await c.query<{ item: string }>('SELECT item FROM inventory WHERE user_id = $1 AND item = ANY($2::text[])', [userId, b.items]);
    const owned = have.rows.map((r) => r.item);
    const price = bundlePrice(b, owned);
    if (price === 0) {
      await c.query('ROLLBACK');
      return 'owned';
    }
    const paid = await c.query('UPDATE wallet SET coins = coins - $2::int WHERE user_id = $1 AND coins >= $2::int', [userId, price]);
    if (paid.rowCount !== 1) {
      await c.query('ROLLBACK');
      return 'poor';
    }
    for (const id of b.items) {
      if (!owned.includes(id)) await c.query(`INSERT INTO inventory (user_id, item, source) VALUES ($1, $2, 'coins')`, [userId, id]);
    }
    await c.query(`INSERT INTO spend (item, currency, amount) VALUES ($1, 'coins', $2)`, [b.id, price]);
    await settleLots(c, userId);
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
/** Returns whether this call granted it (false: already recorded, e.g. a retry). */
export async function recordPurchase(db: Pool, p: PaidCheckout): Promise<boolean> {
  const c = await db.connect();
  try {
    await c.query('BEGIN');
    const ins = await c.query(
      `INSERT INTO purchase (id, user_id, item, amount, currency, payment_intent, status, region)
       VALUES ($1, $2, $3, $4, $5, $6, 'paid', $7) ON CONFLICT (id) DO NOTHING`,
      [p.sessionId, p.userId, p.item, p.amount, p.currency, p.paymentIntent, cleanRegion(p.region)],
    );
    if (ins.rowCount === 1) {
      const pack = coinPack(p.item);
      if (pack) {
        // Remember what this payment gave, so a refund takes back exactly that
        // even if pack sizes or bonuses change later.
        const coins = packTotal(pack);
        await c.query('UPDATE purchase SET coins = $2 WHERE id = $1', [p.sessionId, coins]);
        await credit(c, p.userId, coins, 0);
        // The pack's own coins cost the payment; its bonus coins are free.
        // A licence tester's purchase (amount 0) cost nothing either.
        const lot = `INSERT INTO coin_lot (user_id, purchase_id, paid, region, coins, value, currency, left_coins)
                     SELECT $1, $2, $3, $4, $5::int, $6, $7, $5::int WHERE EXISTS (SELECT 1 FROM "user" WHERE id = $1)`;
        await c.query(lot, [p.userId, p.sessionId, p.amount > 0, cleanRegion(p.region), pack.coins, p.amount, p.currency]);
        if (pack.bonus) await c.query(lot, [p.userId, p.sessionId, false, cleanRegion(p.region), pack.bonus, 0, p.currency]);
        // A wallet below zero (after a refund) pays that back from these first.
        await settleLots(c, p.userId);
      }
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
    return ins.rowCount === 1;
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
  const c = await db.connect();
  try {
    await c.query('BEGIN');
    const r = await c.query<{ id: string; user_id: string | null; item: string; coins: number | null }>(
      `UPDATE purchase SET status = $2, refunded_at = now() WHERE payment_intent = $1 AND status = 'paid' RETURNING id, user_id, item, coins`,
      [paymentIntent, status],
    );
    for (const row of r.rows) {
      if (!row.user_id) continue;
      const pack = coinPack(row.item);
      if (pack) {
        // No record means an old purchase, from before bonus coins: it gave the base amount.
        await credit(c, row.user_id, -(row.coins ?? pack.coins), 0);
        // Its own coins go; any already spent come off the player's other coins.
        await c.query('UPDATE coin_lot SET left_coins = 0, revoked = true WHERE purchase_id = $1', [row.id]);
        await settleLots(c, row.user_id);
      } else await c.query(`DELETE FROM inventory WHERE user_id = $1 AND item = $2 AND source = 'purchase'`, [row.user_id, row.item]);
    }
    await c.query('COMMIT');
  } catch (e) {
    await c.query('ROLLBACK');
    throw e;
  } finally {
    c.release();
  }
}

/** Unspent paid coins, by the buyer's country and the currency paid: what they cost. */
export type UnspentCoins = UnspentRow;

/**
 * Coins bought with money and not yet spent, with what they cost (each lot's
 * price shared over its coins). Japan's Payment Services Act counts these
 * for players in Japan.
 */
export async function unspentCoins(db: Pool): Promise<UnspentCoins[]> {
  const r = await db.query<{ region: string | null; currency: string | null; coins: string; value: string }>(
    `SELECT region, currency, sum(left_coins) AS coins, sum(round(value::numeric * left_coins / coins)) AS value
     FROM coin_lot WHERE paid AND left_coins > 0 AND coins > 0
     GROUP BY region, currency ORDER BY value DESC`,
  );
  return r.rows.map((x) => ({ region: x.region, currency: x.currency, coins: Number(x.coins), value: Number(x.value) }));
}

export async function salesReport(db: Pool, days: number, jpyPerGbp = DEFAULT_JPY_PER_GBP): Promise<SalesReport> {
  // The owner can start the figures from zero (docs/ACCOUNTS.md): nothing
  // before then counts. Records are kept, as refunds and Stripe's retries need them.
  const reset = await db.query<{ at: Date }>(`SELECT at FROM done_once WHERE name = 'sales_reset'`);
  const resetAt = reset.rows[0]?.at ?? null;
  // $1 = 0 means all time; $2 is the reset (or none).
  const since = `(%s >= greatest(CASE WHEN $1::int = 0 THEN '-infinity'::timestamptz ELSE now() - make_interval(days => $1::int) END, coalesce($2::timestamptz, '-infinity')))`;
  const args = [days, resetAt];
  const [players, packs, spends, owners] = await Promise.all([
    db.query<{ total: string; joined: string; buyers: string }>(
      `SELECT (SELECT count(*) FROM "user") AS total,
              (SELECT count(*) FROM "user" WHERE ${since.replace('%s', '"createdAt"')}) AS joined,
              (SELECT count(DISTINCT user_id) FROM purchase WHERE status = 'paid' AND ${since.replace('%s', 'created_at')}) AS buyers`,
      args,
    ),
    // Sales count in the period they were made, refunds in the period they happened
    // (refunds from before refunded_at existed count on the purchase date).
    db.query<{ item: string; currency: string; sold: string; amount: string; refunded: string; refunded_amount: string }>(
      `SELECT item, currency,
              count(*) FILTER (WHERE sale) AS sold,
              coalesce(sum(amount) FILTER (WHERE sale), 0) AS amount,
              count(*) FILTER (WHERE NOT sale) AS refunded,
              coalesce(sum(amount) FILTER (WHERE NOT sale), 0) AS refunded_amount
       FROM (
         SELECT item, currency, amount, true AS sale FROM purchase WHERE ${since.replace('%s', 'created_at')}
         UNION ALL
         SELECT item, currency, amount, false FROM purchase WHERE status <> 'paid' AND ${since.replace('%s', 'coalesce(refunded_at, created_at)')}
       ) AS p
       GROUP BY item, currency ORDER BY amount DESC`,
      args,
    ),
    db.query<{ item: string; currency: string; buys: string; amount: string }>(
      `SELECT item, currency, count(*) AS buys, sum(amount) AS amount
       FROM spend WHERE ${since.replace('%s', 'at')}
       GROUP BY item, currency ORDER BY amount DESC`,
      args,
    ),
    db.query<{ item: string; owners: string }>('SELECT item, count(*) AS owners FROM inventory GROUP BY item ORDER BY owners DESC, item'),
  ]);
  const n = (v: string) => Number(v);
  const p = players.rows[0];
  const unspent = await unspentCoins(db);
  return {
    days,
    resetAt: resetAt ? resetAt.toISOString() : null,
    players: { total: n(p.total), joined: n(p.joined), buyers: n(p.buyers) },
    packs: packs.rows.map((r) => ({ item: r.item, currency: r.currency, sold: n(r.sold), amount: n(r.amount), refunded: n(r.refunded), refundedAmount: n(r.refunded_amount) })),
    spends: spends.rows.map((r) => ({ item: r.item, currency: r.currency, buys: n(r.buys), amount: n(r.amount) })),
    owners: owners.rows.map((r) => ({ item: r.item, owners: n(r.owners) })),
    unspent,
    japan: { yen: japanYen(unspent, jpyPerGbp), limit: JAPAN_LIMIT_YEN, jpyPerGbp },
  };
}

// ---------------------------------------------------------------- gifts

const hashCode = (code: string) => createHash('sha256').update(normaliseGiftCode(code)).digest('hex');

/** A new gift code: 12 letters and digits in three groups, about 59 bits of chance. */
export function newGiftCode(): string {
  let c = '';
  for (let i = 0; i < 12; i++) c += GIFT_ALPHABET[randomInt(GIFT_ALPHABET.length)];
  return `${c.slice(0, 4)}-${c.slice(4, 8)}-${c.slice(8)}`;
}

export type GiftBuyResult = { ok: true; code: string } | { ok: false; why: 'unknown' | 'poor' | 'limit' };

/** Spend the sender's coins on a gift, all or nothing, and return its code (shown to them once). */
export async function buyGift(db: Pool, userId: string, itemId: string, message: string): Promise<GiftBuyResult> {
  const g = giftable(itemId);
  if (!g) return { ok: false, why: 'unknown' };
  const msg = Object.prototype.hasOwnProperty.call(GIFT_MESSAGES, message) ? message : 'none';
  const code = newGiftCode();
  const c = await db.connect();
  try {
    await c.query('BEGIN');
    // Lock the wallet so two gifts at once can't both pass the daily limit.
    await c.query('SELECT 1 FROM wallet WHERE user_id = $1 FOR UPDATE', [userId]);
    const today = await c.query<{ n: string }>(`SELECT count(*) AS n FROM gift WHERE from_user = $1 AND created_at > now() - interval '24 hours'`, [userId]);
    if (Number(today.rows[0].n) >= GIFTS_PER_DAY) {
      await c.query('ROLLBACK');
      return { ok: false, why: 'limit' };
    }
    const paid = await c.query('UPDATE wallet SET coins = coins - $2::int WHERE user_id = $1 AND coins >= $2::int', [userId, g.coins]);
    if (paid.rowCount !== 1) {
      await c.query('ROLLBACK');
      return { ok: false, why: 'poor' };
    }
    const spend = await c.query<{ id: string }>(`INSERT INTO spend (item, currency, amount) VALUES ($1, 'coins', $2) RETURNING id`, [itemId, g.coins]);
    const lots = await settleLots(c, userId);
    await c.query(
      `INSERT INTO gift (code_hash, hint, item, coins, message, from_user, spend_id, lots) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [hashCode(code), code.slice(-4), itemId, g.coins, msg, userId, spend.rows[0].id, JSON.stringify(lots)],
    );
    await c.query('COMMIT');
    return { ok: true, code };
  } catch (e) {
    await c.query('ROLLBACK');
    throw e;
  } finally {
    c.release();
  }
}

export type GiftRedeemResult =
  | { ok: true; item: string; items: string[]; from: string | null; message: string }
  | { ok: false; why: 'unknown' | 'used' | 'own' | 'owned' };

/** Claim a gift with its code: its items go to this player, once. */
export async function redeemGift(db: Pool, userId: string, code: string): Promise<GiftRedeemResult> {
  const c = await db.connect();
  try {
    await c.query('BEGIN');
    const r = await c.query<{ id: string; item: string; message: string; from_user: string | null; redeemed_at: Date | null; cancelled_at: Date | null; from_name: string | null }>(
      `SELECT g.id, g.item, g.message, g.from_user, g.redeemed_at, g.cancelled_at, u.name AS from_name
       FROM gift g LEFT JOIN "user" u ON u.id = g.from_user
       WHERE g.code_hash = $1 FOR UPDATE OF g`,
      [hashCode(code)],
    );
    const gift = r.rows[0];
    const fail = async (why: 'unknown' | 'used' | 'own' | 'owned'): Promise<GiftRedeemResult> => {
      await c.query('ROLLBACK');
      return { ok: false, why };
    };
    if (!gift || gift.cancelled_at) return fail('unknown');
    if (gift.redeemed_at) return fail('used');
    if (gift.from_user === userId) return fail('own');
    const items = giftable(gift.item)?.items ?? [];
    const have = await c.query<{ item: string }>('SELECT item FROM inventory WHERE user_id = $1 AND item = ANY($2::text[])', [userId, items]);
    const missing = items.filter((i) => !have.rows.some((h) => h.item === i));
    // Already has it all: the code stays unused, so it can go to someone else.
    if (!missing.length) return fail('owned');
    for (const i of missing) await c.query(`INSERT INTO inventory (user_id, item, source) VALUES ($1, $2, 'gift')`, [userId, i]);
    await c.query('UPDATE gift SET to_user = $2, redeemed_at = now() WHERE id = $1', [gift.id, userId]);
    await c.query('COMMIT');
    return { ok: true, item: gift.item, items: missing, from: gift.from_name, message: GIFT_MESSAGES[gift.message] ?? '' };
  } catch (e) {
    await c.query('ROLLBACK');
    throw e;
  } finally {
    c.release();
  }
}

/** Unlock a promo code's items for this player: the ones they don't have yet (none: they've used it). */
export async function redeemPromo(db: Pool, userId: string, items: string[]): Promise<string[]> {
  const added: string[] = [];
  for (const i of items) {
    const r = await db.query(`INSERT INTO inventory (user_id, item, source) VALUES ($1, $2, 'promo') ON CONFLICT DO NOTHING`, [userId, i]);
    if (r.rowCount) added.push(i);
  }
  return added;
}

/** Take back a gift nobody has claimed yet: the coins go back to the sender. */
export async function cancelGift(db: Pool, userId: string, giftId: number): Promise<boolean> {
  const c = await db.connect();
  try {
    await c.query('BEGIN');
    const r = await c.query<{ coins: number; spend_id: string | null; lots: LotUse[] | null }>(
      `UPDATE gift SET cancelled_at = now()
       WHERE id = $1 AND from_user = $2 AND redeemed_at IS NULL AND cancelled_at IS NULL
       RETURNING coins, spend_id, lots`,
      [giftId, userId],
    );
    const g = r.rows[0];
    if (!g) {
      await c.query('ROLLBACK');
      return false;
    }
    await credit(c, userId, g.coins, 0);
    // The coins go back where they came from (unless that payment was refunded since).
    for (const u of g.lots ?? []) {
      await c.query('UPDATE coin_lot SET left_coins = least(coins, left_coins + $3) WHERE id = $1 AND user_id = $2 AND NOT revoked', [u.id, userId, u.n]);
    }
    await settleLots(c, userId);
    // Not a sale after all.
    if (g.spend_id) await c.query('DELETE FROM spend WHERE id = $1', [g.spend_id]);
    await c.query('COMMIT');
    return true;
  } catch (e) {
    await c.query('ROLLBACK');
    throw e;
  } finally {
    c.release();
  }
}

/** Gifts this player has sent (never who claimed them). */
export async function giftsSent(db: Pool, userId: string): Promise<GiftSent[]> {
  const r = await db.query<{ id: string; item: string; hint: string; message: string; created_at: Date; redeemed_at: Date | null; cancelled_at: Date | null }>(
    `SELECT id, item, hint, message, created_at, redeemed_at, cancelled_at FROM gift WHERE from_user = $1 ORDER BY created_at DESC LIMIT 50`,
    [userId],
  );
  return r.rows.map((g) => ({
    id: Number(g.id),
    item: g.item,
    hint: g.hint,
    message: g.message,
    createdAt: g.created_at.toISOString(),
    status: g.cancelled_at ? 'cancelled' : g.redeemed_at ? 'claimed' : 'waiting',
  }));
}

/**
 * The Japan alert levels (shares of the ¥10 million limit) the figure has
 * newly reached: each is returned once, then not again until the figure
 * has dropped 10 points below it. The caller emails the owner.
 */
export async function japanAlertsDue(db: Pool, jpyPerGbp = DEFAULT_JPY_PER_GBP): Promise<{ yen: number; levels: number[] }> {
  const yen = japanYen(await unspentCoins(db), jpyPerGbp);
  const reached = japanLevelsReached(yen);
  const name = (l: number) => `japan_alert_${Math.round(l * 100)}`;
  // Well below a level again: it may alert again next time it's reached.
  const rearm = JAPAN_ALERTS.filter((l) => yen < (l - 0.1) * JAPAN_LIMIT_YEN).map(name);
  if (rearm.length) await db.query('DELETE FROM done_once WHERE name = ANY($1::text[])', [rearm]);
  const levels: number[] = [];
  for (const l of reached) {
    const r = await db.query('INSERT INTO done_once (name) VALUES ($1) ON CONFLICT DO NOTHING', [name(l)]);
    if (r.rowCount) levels.push(l);
  }
  return { yen, levels };
}
