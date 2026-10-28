// Anonymous play statistics (docs/USAGE.md): counts the game sends, added to
// totals per day. Nothing about who sent them is read or kept: no cookie, no
// account, no IP address, no time finer than the day. Only entries the
// catalogue allows are counted (src/usage/catalog.ts); anything else is
// dropped. Totals older than 25 months are deleted.

import type { Pool } from 'pg';
import { USAGE_BATCH, validUsage, type UsageEntry, type UsageReport } from '../src/usage/catalog';
import { isWeaponId } from '../src/sim/weapons';

/** Most entries counted in a minute from everyone together, so a flood can't fill the database. */
const PER_MINUTE = 20_000;
/** How long totals are kept. */
const KEEP_MONTHS = 25;

export async function migrateUsage(db: Pool): Promise<void> {
  await db.query(`
    -- Totals per day; never anything about who (docs/USAGE.md).
    CREATE TABLE IF NOT EXISTS usage_day (
      day    date   NOT NULL,
      event  text   NOT NULL,
      detail text   NOT NULL,
      count  bigint NOT NULL DEFAULT 0,
      PRIMARY KEY (day, event, detail)
    );
  `);
}

/** Collects reports in memory and adds them to the day's totals once a minute. */
export function usageCounter(db: Pool) {
  let pending = new Map<string, UsageEntry>();
  let taken = 0;

  async function save(): Promise<void> {
    taken = 0;
    if (!pending.size) return;
    const rows = [...pending.values()];
    pending = new Map();
    // The server's day (UTC): no time of day is kept.
    await db.query(
      `INSERT INTO usage_day (day, event, detail, count)
       SELECT (now() AT TIME ZONE 'UTC')::date, e, d, n FROM unnest($1::text[], $2::text[], $3::bigint[]) AS x(e, d, n)
       ON CONFLICT (day, event, detail) DO UPDATE SET count = usage_day.count + EXCLUDED.count`,
      [rows.map((r) => r.e), rows.map((r) => r.d), rows.map((r) => r.n)],
    );
  }

  async function forget(): Promise<void> {
    await db.query(`DELETE FROM usage_day WHERE day < (now() AT TIME ZONE 'UTC')::date - make_interval(months => ${KEEP_MONTHS})`);
  }

  const timer = setInterval(() => void save().catch((e) => console.error('usage save failed', e)), 60_000);
  timer.unref();
  const daily = setInterval(() => void forget().catch((e) => console.error('usage forget failed', e)), 24 * 60 * 60_000);
  daily.unref();
  void forget().catch((e) => console.error('usage forget failed', e));

  return {
    /** Count a report's allowed entries; returns how many were counted. */
    add(body: unknown): number {
      const entries = (body as { entries?: unknown } | null)?.entries;
      if (!Array.isArray(entries)) return 0;
      let counted = 0;
      for (const x of entries.slice(0, USAGE_BATCH)) {
        if (taken >= PER_MINUTE) break;
        if (!validUsage(x, isWeaponId)) continue;
        taken++;
        counted++;
        const key = `${x.e}?${x.d}`;
        const was = pending.get(key);
        pending.set(key, { e: x.e, d: x.d, n: x.n + (was?.n ?? 0) });
      }
      return counted;
    },
    save,
    forget,
    /** The owner's report: totals for the last `days` days (0 = all kept). */
    async report(days: number): Promise<UsageReport> {
      await save();
      const since = days > 0 ? `WHERE day > (now() AT TIME ZONE 'UTC')::date - ${Math.floor(days)}` : '';
      const rows = await db.query<{ event: string; detail: string; count: string }>(
        `SELECT event, detail, sum(count)::bigint AS count FROM usage_day ${since} GROUP BY event, detail ORDER BY event, count DESC`,
      );
      const perDay = await db.query<{ day: string; opens: string; seconds: string }>(
        `SELECT to_char(day, 'YYYY-MM-DD') AS day,
                coalesce(sum(count) FILTER (WHERE event = 'open'), 0)::bigint AS opens,
                coalesce(sum(count) FILTER (WHERE event = 'seconds'), 0)::bigint AS seconds
           FROM usage_day ${since} GROUP BY day ORDER BY day`,
      );
      return {
        rows: rows.rows.map((r) => ({ event: r.event, detail: r.detail, count: Number(r.count) })),
        days: perDay.rows.map((r) => ({ day: r.day, opens: Number(r.opens), minutes: Math.round(Number(r.seconds) / 60) })),
      };
    },
    close(): void {
      clearInterval(timer);
      clearInterval(daily);
    },
  };
}

export type UsageCounter = ReturnType<typeof usageCounter>;
