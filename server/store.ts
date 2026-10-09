// Player data in Postgres (Neon in production): what each player owns, and
// a record of every purchase. Better Auth keeps its own tables (user,
// session, account, verification) in the same database.
//
// The server is the only thing that grants items: the game never does.

import type { Pool } from 'pg';

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
  `);
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
      // The user may have deleted their account in the meantime: then there's no one to grant to.
      await c.query(
        `INSERT INTO inventory (user_id, item, source)
         SELECT $1, $2, 'purchase' WHERE EXISTS (SELECT 1 FROM "user" WHERE id = $1)
         ON CONFLICT DO NOTHING`,
        [p.userId, p.item],
      );
    }
    await c.query('COMMIT');
  } catch (e) {
    await c.query('ROLLBACK');
    throw e;
  } finally {
    c.release();
  }
}

/** A refund or chargeback: take the item back. */
export async function revokePurchase(db: Pool, paymentIntent: string, status: 'refunded' | 'disputed'): Promise<void> {
  const r = await db.query<{ user_id: string; item: string }>(
    `UPDATE purchase SET status = $2 WHERE payment_intent = $1 AND status = 'paid' RETURNING user_id, item`,
    [paymentIntent, status],
  );
  for (const row of r.rows) {
    await db.query(`DELETE FROM inventory WHERE user_id = $1 AND item = $2 AND source = 'purchase'`, [row.user_id, row.item]);
  }
}
