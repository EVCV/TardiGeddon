import { describe, expect, it } from 'vitest';
import { activeTardi, createWorld, tick } from '../src/sim/world';
import { BTN_UP, EMPTY_INPUT, type SimEvent, type WorldState } from '../src/sim/types';
import { presetScheme } from '../src/sim/schemes';
import { isSolid } from '../src/sim/terrain/terrain';
import { makeWorld, run, runUntilPhase } from './helpers';

function race(seed = 3): WorldState {
  return createWorld({
    seed,
    teams: [
      { name: 'A', color: 1, cpu: false },
      { name: 'B', color: 2, cpu: false },
    ],
    scheme: presetScheme('roperace'),
  });
}

describe('Rope Race', () => {
  it('builds a course: a roof to swing from, everyone on the start line, the flag far away', () => {
    const s = race();
    const r = s.race!;
    expect(r).not.toBeNull();
    expect(r.goalX - r.startX).toBeGreaterThan(s.terrain.w / 2);
    for (let x = 0; x < s.terrain.w; x += 50) expect(isSolid(s.terrain, x, 5)).toBe(true);
    expect(s.tardis.every((t) => t.x === r.startX)).toBe(true);
    // Only the rope and parachute, and the rope is ready in hand.
    const ammo = s.teams[0].ammo;
    expect(ammo.bazooka).toBe(0);
    expect(ammo.rope).toBe(-1);
    expect(s.turn.weapon).toBe('rope');
  });

  it('records a time when the active tardi reaches the flag, and ends the turn', () => {
    const s = race();
    runUntilPhase(s, 'aim');
    run(s, 100);
    const t = activeTardi(s)!;
    t.x = s.race!.goalX;
    t.y = s.race!.goalY;
    const ev: SimEvent[] = [];
    tick(s, EMPTY_INPUT, ev);
    const fin = ev.find((e) => e.t === 'finish');
    expect(fin).toMatchObject({ team: t.team, best: true });
    expect(s.race!.best[t.team]).toBeGreaterThanOrEqual(100);
    expect(s.race!.best[t.team]).toBeLessThan(110);
    expect(s.turn.phase).toBe('settle');
  });

  it('a dunking sends you back to the start instead of killing you', () => {
    const s = race();
    runUntilPhase(s, 'aim');
    const t = activeTardi(s)!;
    t.x = s.race!.goalX - 300;
    t.y = s.waterY + 20;
    const ev = run(s, 1);
    expect(ev.some((e) => e.t === 'drown')).toBe(true);
    expect(t.alive).toBe(true);
    expect(t.x).toBe(s.race!.startX);
    expect(s.turn.phase).toBe('settle');
  });

  it('ends after the set number of tries, fastest best time winning', () => {
    const s = race();
    const tries = s.teams.length * s.scheme.raceRounds;
    for (let i = 0; i < tries && s.turn.phase !== 'gameover'; i++) {
      runUntilPhase(s, 'aim');
      const t = activeTardi(s)!;
      // Team 1 is quicker.
      run(s, t.team === 1 ? 50 : 200);
      t.x = s.race!.goalX;
      t.y = s.race!.goalY;
      run(s, 1);
      runUntilPhase(s, 'start', 3000);
    }
    runUntilPhase(s, 'gameover', 3000);
    expect(s.turn.phase).toBe('gameover');
    expect(s.turn.winner).toBe(1);
    expect(s.race!.best[1]).toBeLessThan(s.race!.best[0]);
  });
});

describe('aiming', () => {
  it('starts fine and speeds up while held, and resets when let go', () => {
    const s = makeWorld();
    runUntilPhase(s, 'aim');
    const a0 = s.turn.aim;
    run(s, 1, { held: BTN_UP, pressed: 0 });
    expect(s.turn.aim - a0).toBe(2); // a nudge is a tiny step
    run(s, 59, { held: BTN_UP, pressed: 0 });
    const fast = s.turn.aim;
    run(s, 1, { held: BTN_UP, pressed: 0 });
    expect(s.turn.aim - fast).toBe(16); // full speed after about a second
    run(s, 1);
    const a1 = s.turn.aim;
    run(s, 1, { held: BTN_UP, pressed: 0 });
    expect(s.turn.aim - a1).toBe(2);
  });
});
