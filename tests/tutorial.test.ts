import { describe, expect, it } from 'vitest';
import { createWorld, tick } from '../src/sim/world';
import { EMPTY_INPUT, TICK_RATE, type SimEvent } from '../src/sim/types';
import { TutorialDummy, tutorialWorld } from '../src/ui/tutorial';

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

  it('the dummy wanders about a little on its turn, never far and never fighting back, and it is soon your go again', () => {
    const s = world();
    const dummy = new TutorialDummy();
    const events: SimEvent[] = [];
    const home = s.tardis[1].x;
    let turns = 0;
    let moved = 0;
    for (let i = 0; i < 120 * TICK_RATE && turns < 8; i++) {
      const dummyTurn = s.teams[s.turn.teamIdx].cpu;
      // Your turn: skip it too (in the real tutorial you'd take your time).
      const input = dummyTurn ? dummy.next(s) : s.turn.phase === 'aim' ? { ...EMPTY_INPUT, cmd: { t: 'skip' as const } } : EMPTY_INPUT;
      const before = s.turn.turnNumber;
      tick(s, input, events);
      if (s.turn.turnNumber !== before) turns++;
      moved = Math.max(moved, Math.abs(s.tardis[1].x - home));
      expect(input.held & 16).toBe(0); // never presses fire
    }
    expect(turns).toBe(8);
    expect(moved).toBeGreaterThan(10);
    expect(moved).toBeLessThan(110);
    expect(Math.abs(s.wind)).toBe(0);
    expect(s.tardis.every((t) => t.alive && t.hp === 100)).toBe(true);
  });

  it('popped or drowned, you come back and the tutorial carries on', () => {
    const s = world();
    // Everyone skips their turns.
    const skip = () => (s.turn.phase === 'aim' ? { ...EMPTY_INPUT, cmd: { t: 'skip' as const } } : EMPTY_INPUT);
    const me = s.tardis.find((t) => t.team === 0)!;
    // Into the sea.
    me.x = 30;
    me.y = s.waterY + 20;
    me.airborne = true;
    const events: SimEvent[] = [];
    for (let i = 0; i < 20 * TICK_RATE && !events.some((e) => e.t === 'respawn'); i++) tick(s, skip(), events);
    expect(events.some((e) => e.t === 'drown')).toBe(true);
    expect(events.some((e) => e.t === 'respawn')).toBe(true);
    expect(me.alive).toBe(true);
    expect(me.hp).toBe(100);
    expect(me.y).toBeLessThan(s.waterY);
    // Then a lot of damage: popped, and back again.
    me.pendingDmg = 500;
    events.length = 0;
    for (let i = 0; i < 20 * TICK_RATE && !events.some((e) => e.t === 'respawn'); i++) tick(s, skip(), events);
    expect(events.some((e) => e.t === 'death')).toBe(true);
    expect(me.alive).toBe(true);
    for (let i = 0; i < 10 * TICK_RATE; i++) tick(s, skip(), events);
    expect(s.turn.phase).not.toBe('gameover');
  });
});
