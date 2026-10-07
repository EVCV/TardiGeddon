import { describe, expect, it } from 'vitest';
import { Matchmaker, QUICK_FILL_MS, QUICK_MAX, type Waiting } from '../server/matchmaker';
import type { ServerMsg } from '../src/net/protocol';

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
});
