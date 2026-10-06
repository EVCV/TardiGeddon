import { describe, expect, it } from 'vitest';
import { activeTardi, tick, TARDI_R } from '../src/sim/world';
import { BTN_FIRE, TICK_RATE, type SimEvent, type WorldState } from '../src/sim/types';
import { makeWorld, run, runUntilPhase } from './helpers';

/** Flat floor at y=600 with a wall at x 1400..1420 (40px tall), no objects, no wind. */
function arena(): WorldState {
  const s = makeWorld();
  const t = s.terrain;
  t.mask.fill(0);
  for (let y = 600; y < t.h; y++) for (let x = 100; x < 1900; x++) t.mask[y * t.w + x] = 1;
  for (let y = 560; y < 600; y++) for (let x = 1400; x < 1420; x++) t.mask[y * t.w + x] = 1;
  s.objects = [];
  s.scheme.crateChance = 0;
  const me = activeTardi(s)!;
  s.tardis.forEach((o, i) => {
    o.x = o === me ? 1000 : 200 + i * 40;
    o.y = 600 - TARDI_R - 1;
    o.airborne = false;
  });
  me.facing = 1;
  runUntilPhase(s, 'aim');
  s.wind = 0;
  return s;
}
const select = (s: WorldState, id: string) => tick(s, { held: 0, pressed: 0, cmd: { t: 'weapon', id } }, []);
const target = (s: WorldState, x: number, y: number) => tick(s, { held: 0, pressed: 0, cmd: { t: 'target', x, y } }, []);

describe('Mortar Pod', () => {
  it('bursts into fragments on impact', () => {
    const s = arena();
    const team = activeTardi(s)!.team;
    select(s, 'mortar');
    s.turn.aim = 300;
    const ev = run(s, 30, { held: BTN_FIRE, pressed: 0 });
    ev.push(...run(s, 300));
    const blasts = ev.filter((e) => e.t === 'explosion');
    expect(blasts.length).toBeGreaterThanOrEqual(2); // main shell + fragments
    expect(s.teams[team].ammo.mortar).toBe(2);
  });
});

describe('Homing Spore', () => {
  it('needs a target before it can be charged', () => {
    const s = arena();
    select(s, 'homing');
    run(s, 10, { held: BTN_FIRE, pressed: 0 });
    expect(s.turn.charging).toBe(false);
    expect(s.projectiles).toHaveLength(0);
  });

  it('curves towards its target', () => {
    // Fire straight up; the target is far to the right on the floor.
    const s = arena();
    select(s, 'homing');
    target(s, 1300, 590);
    s.turn.aim = 1024;
    run(s, 25, { held: BTN_FIRE, pressed: 0 });
    const ev: SimEvent[] = run(s, 400);
    const blast = ev.find((e) => e.t === 'explosion');
    expect(blast).toBeDefined();
    if (blast?.t === 'explosion') expect(Math.abs(blast.x - 1300)).toBeLessThan(60);
  });
});

describe('Rotifer Roller', () => {
  it('walks along the ground, hops the wall and goes off on Fire', () => {
    const s = arena();
    const me = activeTardi(s)!;
    select(s, 'rotifer');
    run(s, 1, { held: BTN_FIRE, pressed: 0 });
    const roller = s.projectiles.find((p) => p.dir === 1)!;
    expect(roller).toBeDefined();
    expect(s.turn.phase).toBe('retreat');
    run(s, 200);
    expect(roller.x).toBeGreaterThan(me.x + 150); // it walked
    expect(roller.y).toBeLessThan(600); // never sank into the floor
    run(s, 150); // still well inside the 400-tick fuse
    const pastWall = roller.x > 1420;
    expect(pastWall).toBe(true); // hopped over the 40px wall
    run(s, 1); // release Fire so the next press is an edge
    const ev = run(s, 3, { held: BTN_FIRE, pressed: 0 });
    expect(ev.some((e) => e.t === 'explosion' && e.r === 48)).toBe(true);
    expect(s.projectiles.includes(roller)).toBe(false);
    // Retreat shrinks back to the normal few seconds after the blast.
    expect(s.turn.timer).toBeLessThanOrEqual(s.scheme.retreatTime * TICK_RATE);
  });

  it('explodes by itself when its fuse runs out', () => {
    const s = arena();
    select(s, 'rotifer');
    run(s, 1, { held: BTN_FIRE, pressed: 0 });
    const ev = run(s, 420);
    expect(ev.some((e) => e.t === 'explosion' && e.r === 48)).toBe(true);
  });
});
