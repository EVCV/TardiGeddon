import { describe, expect, it } from 'vitest';
import { Matchmaker, QUICK_FILL_MS, QUICK_MAX, type Waiting } from '../server/matchmaker';
import type { ServerMsg } from '../src/net/protocol';
import { newRatings, ratingWindow, tierFor } from '../src/stats/rank';

const member = () => {
  const msgs: ServerMsg[] = [];
  return { msgs, send: (m: ServerMsg) => msgs.push(m) };
};

function setup() {
  let now = 0;
  const matches: { players: Waiting[]; cpu: boolean }[] = [];
  const mm = new Matchmaker((players, cpu) => matches.push({ players, cpu }), () => now);
  return { mm, matches, advance: (ms: number) => (now += ms) };
}

describe('quick play matchmaker', () => {
  it('says how long each wait lasted and how it ended (for the play statistics)', () => {
    const { mm, advance } = setup();
    const ends: [number, string][] = [];
    mm.onWaitEnd = (ms, how, who) => {
      expect(who).toBeDefined(); // (so the server can skip a player who turned statistics off)
      ends.push([ms, how]);
    };
    const [a, b, c, d, e] = Array.from({ length: 5 }, member);
    mm.add(a, {});
    mm.add(b, {});
    advance(QUICK_FILL_MS);
    mm.tick();
    mm.add(c, {});
    advance(1000);
    mm.vsCpu(c);
    mm.add(d, {});
    mm.add(d, { name: 'again' }); // asking again keeps their place
    advance(2000);
    mm.remove(d);
    mm.add(e, {});
    mm.remove(e, 'disconnected');
    mm.remove(e, 'disconnected'); // (not waiting any more: nothing)
    expect(ends).toEqual([
      [QUICK_FILL_MS, 'matched'],
      [QUICK_FILL_MS, 'matched'],
      [1000, 'cpu'],
      [2000, 'gaveup'],
      [0, 'disconnected'],
    ]);
  });

  it("counts a match the server couldn't make as an error", () => {
    let now = 0;
    const mm = new Matchmaker(() => false, () => now);
    const ends: string[] = [];
    mm.onWaitEnd = (_ms, how) => ends.push(how);
    mm.add(member(), {});
    mm.add(member(), {});
    now += QUICK_FILL_MS;
    mm.tick();
    expect(ends).toEqual(['error', 'error']);
  });

  it('waits a few seconds for more players, then starts with whoever is there', () => {
    const { mm, matches, advance } = setup();
    const a = member();
    const b = member();
    mm.add(a, {});
    mm.tick();
    expect(matches).toHaveLength(0);
    expect(a.msgs.at(-1)).toEqual({ t: 'queue', waiting: 1 });
    mm.add(b, {});
    expect(a.msgs.at(-1)).toEqual({ t: 'queue', waiting: 2 });
    advance(QUICK_FILL_MS - 100);
    mm.tick();
    expect(matches).toHaveLength(0); // still hoping for more
    advance(200);
    mm.tick();
    expect(matches).toHaveLength(1);
    expect(matches[0].players.map((p) => p.member)).toEqual([a, b]);
    expect(mm.waiting).toBe(0);
  });

  it('starts a full match at once', () => {
    const { mm, matches } = setup();
    const ms = Array.from({ length: QUICK_MAX + 1 }, member);
    for (const m of ms) mm.add(m, {});
    mm.tick();
    expect(matches).toHaveLength(1);
    expect(matches[0].players).toHaveLength(QUICK_MAX);
    expect(mm.waiting).toBe(1);
  });

  it('never matches a lone player with nobody, but they can choose a CPU', () => {
    const { mm, matches, advance } = setup();
    const a = member();
    mm.add(a, {});
    advance(60_000);
    mm.tick();
    expect(matches).toHaveLength(0);
    mm.vsCpu(a);
    expect(matches).toEqual([{ players: [expect.objectContaining({ member: a })], cpu: true }]);
    expect(mm.waiting).toBe(0);
  });

  it('forgets players who cancel or disconnect', () => {
    const { mm, matches, advance } = setup();
    const a = member();
    const b = member();
    mm.add(a, {});
    mm.add(a, {}); // no double entries
    mm.add(b, {});
    mm.remove(a);
    expect(b.msgs.at(-1)).toEqual({ t: 'queue', waiting: 1 });
    advance(QUICK_FILL_MS * 2);
    mm.tick();
    expect(matches).toHaveLength(0);
  });

  it('never puts players who blocked each other in the same match', () => {
    const { mm, matches, advance } = setup();
    const a = { ...member(), pid: 'aA' };
    const b = { ...member(), pid: 'aB' };
    const c = { ...member(), pid: 'aC' };
    mm.add(a, {}, new Set(['aB']));
    mm.add(b, {});
    advance(QUICK_FILL_MS);
    mm.tick();
    expect(matches).toHaveLength(0); // a blocked b: they wait
    mm.add(c, {});
    advance(QUICK_FILL_MS);
    mm.tick();
    expect(matches).toHaveLength(1);
    expect(matches[0].players.map((w) => w.member)).toEqual([a, c]);
    expect(mm.waiting).toBe(1); // b still waits for someone else
  });
});

describe('ranked quick play', () => {
  it('matches players of a similar rating first, and widens the range the longer they wait', () => {
    const { mm, matches, advance } = setup();
    const pro = { ...member(), rating: 1800 };
    const newbie = { ...member(), rating: 950 };
    const mid = { ...member(), rating: 1050 };
    mm.add(pro, {});
    mm.add(newbie, {});
    advance(QUICK_FILL_MS + 100);
    mm.tick();
    expect(matches).toHaveLength(0); // 850 apart: not yet
    mm.add(mid, {});
    advance(QUICK_FILL_MS + 100);
    mm.tick();
    // The newbie and the similar player go together; the pro keeps waiting...
    expect(matches.map((m) => m.players.map((p) => p.member))).toEqual([[newbie, mid]]);
    // ...until the range is wide enough for anyone (a guest counts as a new player).
    const guest = member();
    mm.add(guest, {});
    advance(20_000);
    mm.tick();
    expect(matches[1].players.map((p) => p.member)).toEqual([pro, guest]);
  });

  it('moves ratings: beating a stronger player is worth more, and new players move faster', () => {
    const [w1, l1] = newRatings([{ rating: 1000, rated: 30 }, { rating: 1000, rated: 30 }], 0);
    expect(w1).toBe(1012);
    expect(l1).toBe(988);
    const [upset] = newRatings([{ rating: 1000, rated: 30 }, { rating: 1400, rated: 30 }], 0);
    expect(upset - 1000).toBeGreaterThan(20);
    const [fresh] = newRatings([{ rating: 1000, rated: 0 }, { rating: 1000, rated: 30 }], 0);
    expect(fresh).toBe(1020);
    // Four players: the winner gains, each loser loses a little.
    const four = newRatings(Array.from({ length: 4 }, () => ({ rating: 1000, rated: 30 })), 2);
    expect(four[2]).toBeGreaterThan(1000);
    for (const i of [0, 1, 3]) expect(four[i]).toBeLessThan(1000);
    // A draw between equals changes nothing.
    expect(newRatings([{ rating: 1200, rated: 30 }, { rating: 1200, rated: 30 }], -1)).toEqual([1200, 1200]);
    expect(tierFor(1000).name).toBe('Moss');
    expect(tierFor(1750).name).toBe('Tun Legend');
    expect(tierFor(400).name).toBe('Egg');
    expect(ratingWindow(0)).toBe(200);
    expect(ratingWindow(60_000)).toBe(2000);
  });
});
