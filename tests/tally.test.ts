import { describe, expect, it } from 'vitest';
import { MatchTally } from '../src/stats/tally';
import type { SimEvent } from '../src/sim/types';
import { makeWorld } from './helpers';

describe('match tally', () => {
  it('credits damage and pops to the team whose turn it is, own goals separately', () => {
    const s = makeWorld();
    const me = s.turn.teamIdx;
    const mine = s.tardis.find((t) => t.team === me)!;
    const enemy = s.tardis.find((t) => t.team !== me)!;
    const tally = new MatchTally(s.teams.length);
    const ev: SimEvent[] = [
      { t: 'damage', id: enemy.id, amount: 30 },
      { t: 'damage', id: mine.id, amount: 12 },
      { t: 'death', id: enemy.id },
      { t: 'drown', id: mine.id },
    ];
    tally.add(s, ev);
    expect(tally.teams[me]).toEqual({ popped: 1, damage: 30, selfDamage: 12, selfPopped: 1 });
    expect(tally.teams[enemy.team]).toEqual({ popped: 0, damage: 0, selfDamage: 0, selfPopped: 0 });
  });

  it('ignores poison at the start of a turn', () => {
    const s = makeWorld();
    const enemy = s.tardis.find((t) => t.team !== s.turn.teamIdx)!;
    const tally = new MatchTally(s.teams.length);
    tally.add(s, [{ t: 'turnStart', team: s.turn.teamIdx, tardi: 0 }, { t: 'damage', id: enemy.id, amount: 5 }]);
    expect(tally.teams[s.turn.teamIdx].damage).toBe(0);
  });
});
