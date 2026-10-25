import { describe, expect, it } from 'vitest';
import { AIM_MAX, TARDI_R, activeTardi, createWorld, ropeTrace, tick } from '../src/sim/world';
import { BTN_DOWN, BTN_UP, EMPTY_INPUT, type SimEvent, type WorldState } from '../src/sim/types';
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

describe('Rope Race ties', () => {
  it('a tie for the fastest time is a draw', () => {
    const s = race();
    const tries = s.teams.length * s.scheme.raceRounds;
    for (let i = 0; i < tries && s.turn.phase !== 'gameover'; i++) {
      runUntilPhase(s, 'aim');
      const t = activeTardi(s)!;
      run(s, 80); // everyone equally quick
      t.x = s.race!.goalX;
      t.y = s.race!.goalY;
      run(s, 1);
      runUntilPhase(s, 'start', 3000);
    }
    runUntilPhase(s, 'gameover', 3000);
    expect(s.race!.best[0]).toBe(s.race!.best[1]);
    expect(s.turn.winner).toBe(-1);
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

  it('starts fine again when switching straight from up to down', () => {
    const s = makeWorld();
    runUntilPhase(s, 'aim');
    run(s, 60, { held: BTN_UP, pressed: 0 });
    const a = s.turn.aim;
    run(s, 1, { held: BTN_DOWN, pressed: 0 });
    expect(a - s.turn.aim).toBe(2);
  });
});

describe('Rope Race courses', () => {
  it('always have something to rope onto overhead, from the start and from anywhere on the ground', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const s = createWorld({ seed: seed * 7919, teams: [{ name: 'A', color: 1, cpu: false }, { name: 'B', color: 2, cpu: false }], scheme: presetScheme('roperace') });
      const t = s.terrain;
      // From the start: some upward aim, either way, catches.
      const r = s.race!;
      const catches = [1, -1].some((f) => [0.5, 0.65, 0.8, 0.95].some((a) => ropeTrace(t, r.startX, r.startY, f, Math.round(AIM_MAX * a)).hit));
      expect(catches, `seed ${seed * 7919}: nothing to rope onto from the start`).toBe(true);
      // Anywhere a tardi could stand: straight up reaches the roof.
      for (let x = 40; x < t.w - 40; x += 25) {
        let y = 0;
        while (y < t.h && t.mask[y * t.w + x]) y++; // through the roof
        while (y < s.waterY && !t.mask[y * t.w + x]) y++; // down to the ground
        if (y >= s.waterY) continue;
        const up = [1, -1].some((f) => [0.6, 0.8, 1].some((a) => ropeTrace(t, x, y - TARDI_R - 1, f, Math.round(AIM_MAX * a)).hit));
        expect(up, `seed ${seed * 7919} x ${x}`).toBe(true);
      }
    }
  });
});
