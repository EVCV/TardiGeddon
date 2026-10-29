import { describe, expect, it } from 'vitest';
import { USAGE_ERRORS_PER_VISIT, USAGE_EVENTS, foldLegacy, lengthBucket, loadBucket, usageDetail, usageMax, validUsage, waitBucket } from '../src/usage/catalog';
import { COIN_PACKS } from '../src/shop/catalog';
import { usageCounter } from '../server/usage';
import { isWeaponId } from '../src/sim/weapons';
import type { Pool } from 'pg';

const ok = (x: unknown) => validUsage(x, isWeaponId);

describe('anonymous statistics: only what the catalogue allows', () => {
  it('accepts the events the game sends', () => {
    expect(ok({ e: 'app', d: usageDetail('app', { platform: 'ios' }), n: 1 })).toBe(true);
    expect(ok({ e: 'device', d: 'device=tablet', n: 1 })).toBe(true);
    expect(ok({ e: 'lang', d: 'lang=pt-BR', n: 1 })).toBe(true);
    expect(ok({ e: 'seconds', d: '', n: 3600 })).toBe(true);
    expect(ok({ e: 'result', d: 'mode=cpu&skill=normal&outcome=won', n: 2 })).toBe(true);
    expect(ok({ e: 'weapon', d: 'weapon=bazooka', n: 7 })).toBe(true);
  });

  it('refuses anything that could carry free text or tell players apart', () => {
    // A name, a code or an ID where a value from the list belongs.
    expect(ok({ e: 'page', d: 'page=Sam', n: 1 })).toBe(false);
    expect(ok({ e: 'app', d: 'platform=web&id=123', n: 1 })).toBe(false);
    expect(ok({ e: 'app', d: 'platform=web=x', n: 1 })).toBe(false);
    // Details out of order, missing, or for another event.
    expect(ok({ e: 'result', d: 'skill=normal&mode=cpu&outcome=won', n: 1 })).toBe(false);
    expect(ok({ e: 'result', d: 'mode=cpu', n: 1 })).toBe(false);
    expect(ok({ e: 'app', d: 'device=phone', n: 1 })).toBe(false);
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
        expect(['platform', 'device', 'lang', 'length', 'page', 'mode', 'skill', 'outcome', 'weapon', 'kind', 'where', 'step', 'from', 'pack', 'store', 'what', 'time', 'wait', 'end', 'action']).toContain(k);
        expect(values === 'weapon' || Array.isArray(values)).toBe(true);
      }
    }
  });

  it('no event combines the app, the device and the language', () => {
    for (const spec of Object.values(USAGE_EVENTS)) {
      expect(['platform', 'device', 'lang'].filter((k) => Object.hasOwn(spec, k)).length).toBeLessThanOrEqual(1);
    }
    expect(Object.hasOwn(USAGE_EVENTS, 'open')).toBe(false);
  });

  it("splits an older game's combined open into three counts, never kept whole", () => {
    const old = { e: 'open', d: 'platform=ios&device=tablet&lang=ja', n: 1 };
    expect(ok(old)).toBe(false);
    expect(foldLegacy(old)).toEqual([
      { e: 'app', d: 'platform=ios', n: 1 },
      { e: 'device', d: 'device=tablet', n: 1 },
      { e: 'lang', d: 'lang=ja', n: 1 },
    ]);
    for (const p of foldLegacy(old)!) expect(ok(p)).toBe(true);
    // Only a real old "open": nothing else, and no free text, gets through this way.
    expect(foldLegacy({ e: 'open', d: 'platform=ios&device=tablet&lang=Sam', n: 1 })).toBeNull();
    expect(foldLegacy({ e: 'open', d: 'platform=ios&device=tablet', n: 1 })).toBeNull();
    expect(foldLegacy({ e: 'open', d: 'platform=ios&device=tablet&lang=ja&id=1', n: 1 })).toBeNull();
    expect(foldLegacy({ e: 'open', d: 'platform=ios&device=tablet&lang=ja', n: 51 })).toBeNull();
    expect(foldLegacy({ e: 'page', d: 'page=lobby', n: 1 })).toBeNull();
    expect(foldLegacy(null)).toBeNull();
  });

  it('counts errors by kind and place only, never their message', () => {
    expect(ok({ e: 'error', d: 'kind=error&where=menu', n: 1 })).toBe(true);
    expect(ok({ e: 'error', d: 'kind=desync&where=online', n: 1 })).toBe(true);
    expect(ok({ e: 'error', d: 'kind=webgl&where=replay', n: 1 })).toBe(true);
    expect(ok({ e: 'error', d: "kind=TypeError: Cannot read properties of undefined (reading 'Sam')&where=menu", n: 1 })).toBe(false);
    expect(ok({ e: 'error', d: 'kind=error&where=menu&message=Sam', n: 1 })).toBe(false);
    expect(ok({ e: 'error', d: 'kind=error&where=https://example.com/x.js', n: 1 })).toBe(false);
    expect(ok({ e: 'error', d: 'kind=error&where=menu', n: USAGE_ERRORS_PER_VISIT + 1 })).toBe(false);
    expect(usageMax('error')).toBe(USAGE_ERRORS_PER_VISIT);
  });

  it('counts tutorial steps from the list', () => {
    for (const step of ['walk', 'hit', 'wind', 'done']) expect(ok({ e: 'tutorial', d: `step=${step}`, n: 1 })).toBe(true);
    expect(ok({ e: 'tutorial', d: 'step=3', n: 1 })).toBe(false);
    expect(ok({ e: 'tutorial', d: 'step=Sam', n: 1 })).toBe(false);
  });

  it('counts the Get coins funnel with catalogue packs and known stores only', () => {
    expect(ok({ e: 'coinstap', d: 'from=banner', n: 1 })).toBe(true);
    expect(ok({ e: 'coinstap', d: 'from=wallet', n: 1 })).toBe(true);
    expect(ok({ e: 'coinstap', d: 'from=https://evil.example', n: 1 })).toBe(false);
    for (const p of COIN_PACKS) expect(ok({ e: 'coinspack', d: `pack=${p.id}`, n: 1 })).toBe(true);
    expect(ok({ e: 'coinspack', d: 'pack=coins:999999', n: 1 })).toBe(false);
    expect(ok({ e: 'coinspack', d: 'pack=hat:crown', n: 1 })).toBe(false);
    for (const store of ['stripe', 'play', 'appstore']) for (const step of ['start', 'cancel', 'fail', 'pending', 'done']) expect(ok({ e: 'checkout', d: `store=${store}&step=${step}`, n: 1 })).toBe(true);
    expect(ok({ e: 'checkout', d: 'store=paypal&step=done', n: 1 })).toBe(false);
    expect(ok({ e: 'checkout', d: 'store=stripe&step=card declined for Sam', n: 1 })).toBe(false);
  });

  it('counts loading times and quick-play waits as buckets, never exact times', () => {
    expect(ok({ e: 'load', d: 'what=menu&time=1-2s&device=phone', n: 1 })).toBe(true);
    expect(ok({ e: 'load', d: 'what=match&time=20s+&device=desktop', n: 1 })).toBe(true);
    expect(ok({ e: 'load', d: 'what=menu&time=1234&device=phone', n: 1 })).toBe(false);
    expect(ok({ e: 'load', d: 'what=menu&time=1-2s', n: 1 })).toBe(false);
    expect(ok({ e: 'quick', d: 'wait=<5s&end=matched', n: 1 })).toBe(true);
    expect(ok({ e: 'quick', d: 'wait=17s&end=matched', n: 1 })).toBe(false);
    expect(ok({ e: 'quick', d: 'wait=<5s&end=ABCDE', n: 1 })).toBe(false);
    expect(ok({ e: 'room', d: 'kind=private&action=created', n: 1 })).toBe(true);
    expect(ok({ e: 'room', d: 'kind=ABCDE&action=joined', n: 1 })).toBe(false);
    expect(loadBucket(400)).toBe('<1s');
    expect(loadBucket(2500)).toBe('2-3s');
    expect(loadBucket(60_000)).toBe('20s+');
    expect(waitBucket(3000)).toBe('<5s');
    expect(waitBucket(45_000)).toBe('30-60s');
    expect(waitBucket(10 * 60_000)).toBe('5m+');
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

  it("splits an older game's open, and counts what the server sees itself, never anything else", async () => {
    const { db, queries } = fakeDb();
    const c = usageCounter(db);
    expect(c.add({ entries: [{ e: 'open', d: 'platform=ios&device=tablet&lang=ja', n: 1 }] })).toBe(1);
    c.count('quick', { wait: '<5s', end: 'matched' });
    c.count('room', { kind: 'private', action: 'created' });
    c.count('quick', { wait: 'Sam', end: 'matched' } as never);
    await c.save();
    const insert = queries.find((q) => q.sql.includes('INSERT INTO usage_day'))!;
    expect(insert.params).toEqual([
      ['app', 'device', 'lang', 'quick', 'room'],
      ['platform=ios', 'device=tablet', 'lang=ja', 'wait=<5s&end=matched', 'kind=private&action=created'],
      [1, 1, 1, 1, 1],
    ]);
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
      c.add({ entries: [{ e: 'app', d: 'platform=web', n: 1 }, { e: 'seconds', d: '', n: 90 }] });
      await c.save();
      c.add({ entries: [{ e: 'app', d: 'platform=web', n: 2 }, { e: 'result', d: 'mode=cpu&skill=normal&outcome=won', n: 1 }] });
      const r = await c.report(7);
      expect(r.rows).toContainEqual({ event: 'app', detail: 'platform=web', count: 3 });
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
      // Totals an older server kept as one combined "open" are split into three when it starts.
      await db.query(`INSERT INTO usage_day VALUES (now()::date, 'open', 'platform=web&device=phone&lang=en', 2), (now()::date, 'open', 'platform=ios&device=phone&lang=en', 1)`);
      await migrateUsage(db);
      expect((await db.query(`SELECT * FROM usage_day WHERE event = 'open'`)).rowCount).toBe(0);
      const split = await c.report(7);
      expect(split.rows).toContainEqual({ event: 'app', detail: 'platform=web', count: 5 });
      expect(split.rows).toContainEqual({ event: 'app', detail: 'platform=ios', count: 1 });
      expect(split.rows).toContainEqual({ event: 'device', detail: 'device=phone', count: 3 });
      expect(split.rows).toContainEqual({ event: 'lang', detail: 'lang=en', count: 3 });
      c.close();
    } finally {
      await db.end();
    }
  });
});
