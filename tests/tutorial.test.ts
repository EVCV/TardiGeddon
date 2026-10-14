import { describe, expect, it } from 'vitest';
import { createWorld, tick } from '../src/sim/world';
import { EMPTY_INPUT, TICK_RATE, type SimEvent } from '../src/sim/types';
import { dummyPlayer, tutorialWorld } from '../src/ui/tutorial';

describe('tutorial practice match', () => {
  const world = () => createWorld(tutorialWorld({ name: 'You', color: 0xe04848, cpu: false, names: ['Tester', 'B', 'C', 'D'] }));

  it('is you against one dummy, with nothing else on the map and no wind', () => {
    const s = world();
    expect(s.teams.map((t) => t.cpu)).toEqual([false, true]);
    expect(s.tardis).toHaveLength(2);
    expect(s.tardis[0].name).toBe('Tester');
    expect(s.objects).toEqual([]);
    expect(Math.abs(s.wind)).toBe(0);
    expect(s.teams[0].ammo.bazooka).not.toBe(0);
    expect(s.teams[0].ammo.airstrike).not.toBe(0);
  });

  it('the dummy skips its turn straight away, so it is soon your go again', () => {
    const s = world();
    const events: SimEvent[] = [];
    // Your turn: skip it too (in the real tutorial you'd take your time).
    let turns = 0;
    for (let i = 0; i < 60 * TICK_RATE && turns < 4; i++) {
      const dummyTurn = s.teams[s.turn.teamIdx].cpu;
      const input = dummyTurn ? dummyPlayer.next() : s.turn.phase === 'aim' ? { ...EMPTY_INPUT, cmd: { t: 'skip' as const } } : EMPTY_INPUT;
      const before = s.turn.turnNumber;
      tick(s, input, events);
      if (s.turn.turnNumber !== before) turns++;
    }
    expect(turns).toBe(4);
    expect(Math.abs(s.wind)).toBe(0);
    expect(s.tardis.every((t) => t.alive && t.hp === 100)).toBe(true);
  });
});
