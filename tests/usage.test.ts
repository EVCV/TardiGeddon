import { describe, expect, it } from 'vitest';
import { USAGE_EVENTS, lengthBucket, usageDetail, validUsage } from '../src/usage/catalog';
import { usageCounter } from '../server/usage';
import { isWeaponId } from '../src/sim/weapons';
import type { Pool } from 'pg';

const ok = (x: unknown) => validUsage(x, isWeaponId);

describe('anonymous statistics: only what the catalogue allows', () => {
  it('accepts the events the game sends', () => {
    expect(ok({ e: 'open', d: usageDetail('open', { platform: 'ios', device: 'phone', lang: 'pt-BR' }), n: 1 })).toBe(true);
    expect(ok({ e: 'seconds', d: '', n: 3600 })).toBe(true);
    expect(ok({ e: 'result', d: 'mode=cpu&skill=normal&outcome=won', n: 2 })).toBe(true);
    expect(ok({ e: 'weapon', d: 'weapon=bazooka', n: 7 })).toBe(true);
  });

  it('refuses anything that could carry free text or tell players apart', () => {
    // A name, a code or an ID where a value from the list belongs.
    expect(ok({ e: 'page', d: 'page=Sam', n: 1 })).toBe(false);
    expect(ok({ e: 'open', d: 'platform=web&device=phone&lang=en&id=123', n: 1 })).toBe(false);
    expect(ok({ e: 'open', d: 'platform=web&device=phone&lang=en=x', n: 1 })).toBe(false);
    // Details out of order, missing, or for another event.
    expect(ok({ e: 'open', d: 'device=phone&platform=web&lang=en', n: 1 })).toBe(false);
    expect(ok({ e: 'open', d: 'platform=web', n: 1 })).toBe(false);
    expect(ok({ e: 'seconds', d: 'page=lobby', n: 1 })).toBe(false);
    // Unknown events, inherited names, and weapons that aren't weapons.
    expect(ok({ e: 'email', d: '', n: 1 })).toBe(false);
    expect(ok({ e: 'constructor', d: '', n: 1 })).toBe(false);
    expect(ok({ e: '__proto__', d: '', n: 1 })).toBe(false);
    expect(ok({ e: 'weapon', d: 'weapon=constructor', n: 1 })).toBe(false);
    expect(ok({ e: 'weapon', d: 'weapon=hello', n: 1 })).toBe(false);
    // Counts: whole, at least 1, at most the event's limit.
    expect(ok({ e: 'page', d: 'page=lobby', n: 0 })).toBe(false);
    expect(ok({ e: 'page', d: 'page=lobby', n: 1.5 })).toBe(false);
    expect(ok({ e: 'page', d: 'page=lobby', n: 51 })).toBe(false);
    expect(ok({ e: 'seconds', d: '', n: 4 * 3600 + 1 })).toBe(false);
    expect(ok({ e: 'page', d: 'page=lobby', n: '1' })).toBe(false);
    expect(ok(null)).toBe(false);
    expect(ok('page')).toBe(false);
  });

  it('has no event or detail that could hold a name, a time or an ID', () => {
    for (const [e, spec] of Object.entries(USAGE_EVENTS)) {
      expect(e).toMatch(/^[a-z]+$/);
      for (const [k, values] of Object.entries(spec)) {
        expect(['platform', 'device', 'lang', 'length', 'page', 'mode', 'skill', 'outcome', 'weapon']).toContain(k);
        expect(values === 'weapon' || Array.isArray(values)).toBe(true);
      }
    }
  });

  it('puts visits in buckets', () => {
    expect(lengthBucket(3)).toBe('<10s');
    expect(lengthBucket(30)).toBe('10s-1m');
    expect(lengthBucket(4 * 60)).toBe('1-5m');
    expect(lengthBucket(20 * 60)).toBe('15-30m');
    expect(lengthBucket(3 * 3600)).toBe('60m+');
  });
});

describe('the server adds up counts', () => {
  function fakeDb() {
    const queries: { sql: string; params?: unknown[] }[] = [];
    const db = {
      query: async (sql: string, params?: unknown[]) => {
        queries.push({ sql, params });
        return { rows: [] };
      },
    } as unknown as Pool;
    return { db, queries };
  }

  it('keeps only allowed entries, adds them together and saves totals without anything about the sender', async () => {
    const { db, queries } = fakeDb();
    const c = usageCounter(db);
    expect(
      c.add({
        entries: [
          { e: 'page', d: 'page=shop', n: 2 },
          { e: 'page', d: 'page=shop', n: 3 },
          { e: 'page', d: 'page=Sam', n: 1 },
          { e: 'weapon', d: 'weapon=grenade', n: 4 },
        ],
      }),
    ).toBe(3);
    expect(c.add({ entries: 'nope' })).toBe(0);
    expect(c.add(null)).toBe(0);
    await c.save();
    const insert = queries.find((q) => q.sql.includes('INSERT INTO usage_day'))!;
    expect(insert.params).toEqual([
      ['page', 'weapon'],
      ['page=shop', 'weapon=grenade'],
      [5, 4],
    ]);
    // The table holds the day, the event, its details and a count: nothing else.
    c.close();
  });

  it('takes at most a batch from one report', () => {
    const { db } = fakeDb();
    const c = usageCounter(db);
    const entries = Array.from({ length: 200 }, () => ({ e: 'page', d: 'page=lobby', n: 1 }));
    expect(c.add({ entries })).toBe(60);
    c.close();
  });
});

// Against a real Postgres, when there is one (like tests/accounts.test.ts).
const DB = process.env.TEST_DATABASE_URL;
describe.skipIf(!DB)('the server keeps daily totals in Postgres', () => {
  it('adds reports to the day, reports them back, and keeps no more than the totals', async () => {
    const { Pool } = await import('pg');
    const { migrateUsage } = await import('../server/usage');
    // A schema of its own, so the accounts tests (sharing the database) aren't disturbed.
    const setup = new Pool({ connectionString: DB });
    await setup.query('DROP SCHEMA IF EXISTS usage_test CASCADE; CREATE SCHEMA usage_test');
    await setup.end();
    const db = new Pool({ connectionString: DB, options: '-c search_path=usage_test' });
    try {
      await migrateUsage(db);
      const c = usageCounter(db);
      c.add({ entries: [{ e: 'open', d: 'platform=web&device=phone&lang=en', n: 1 }, { e: 'seconds', d: '', n: 90 }] });
      await c.save();
      c.add({ entries: [{ e: 'open', d: 'platform=web&device=phone&lang=en', n: 2 }, { e: 'result', d: 'mode=cpu&skill=normal&outcome=won', n: 1 }] });
      const r = await c.report(7);
      expect(r.rows).toContainEqual({ event: 'open', detail: 'platform=web&device=phone&lang=en', count: 3 });
      expect(r.rows).toContainEqual({ event: 'result', detail: 'mode=cpu&skill=normal&outcome=won', count: 1 });
      expect(r.days).toHaveLength(1);
      expect(r.days[0]).toMatchObject({ opens: 3, minutes: 2 });
      // One row per day, event and details: nothing per report.
      const cols = await db.query<{ column_name: string }>(`SELECT column_name FROM information_schema.columns WHERE table_schema = 'usage_test' AND table_name = 'usage_day' ORDER BY column_name`);
      expect(cols.rows.map((x) => x.column_name)).toEqual(['count', 'day', 'detail', 'event']);
      expect((await db.query('SELECT * FROM usage_day')).rowCount).toBe(3);
      // Old totals go.
      await db.query(`INSERT INTO usage_day VALUES (now()::date - interval '26 months', 'open', 'x', 1)`);
      await c.forget();
      expect((await db.query('SELECT * FROM usage_day')).rowCount).toBe(3);
      c.close();
    } finally {
      await db.end();
    }
  });
});
