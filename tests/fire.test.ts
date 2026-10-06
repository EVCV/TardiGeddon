import { describe, expect, it } from 'vitest';
import { activeTardi, tick, TARDI_R } from '../src/sim/world';
import { BTN_FIRE, type SimEvent, type WorldState } from '../src/sim/types';
import { makeWorld, run, runUntilPhase } from './helpers';

function arena(): WorldState {
  const s = makeWorld();
  const t = s.terrain;
  t.mask.fill(0);
  for (let y = 600; y < t.h; y++) for (let x = 100; x < 1900; x++) t.mask[y * t.w + x] = 1;
  s.objects = [];
  s.scheme.crateChance = 0;
  const me = activeTardi(s)!;
  s.tardis.forEach((o, i) => {
    o.x = o === me ? 1000 : 200 + i * 60;
    o.y = 600 - TARDI_R - 1;
    o.airborne = false;
  });
  runUntilPhase(s, 'aim');
  s.wind = 0;
  return s;
}
const fireAt = (s: WorldState, weapon: string, x: number, y: number) =>
  s.projectiles.push({ id: s.nextId++, weapon, x, y, vx: 0, vy: 0, fuse: 1, owner: -1, age: 0, tx: 0, ty: 0, dir: 0, hits: 0 });

describe('fire', () => {
  it('a Hot Sap Bomb spills flames that settle and burn a tardi standing in them', () => {
    const s = arena();
    const victim = s.tardis.find((t) => t !== activeTardi(s))!;
    victim.x = 1500;
    fireAt(s, 'sapbomb', 1500, 590);
    const ev: SimEvent[] = run(s, 1);
    expect(s.flames.length).toBe(18);
    ev.push(...run(s, 100));
    // Settled on (and slowly burning into) the floor, not flying around.
    expect(s.flames.every((f) => f.y > 585 && f.y < 610)).toBe(true);
    expect(ev.some((e) => e.t === 'burn')).toBe(true);
    expect(victim.pendingDmg + (100 - victim.hp)).toBeGreaterThan(5);
  });

  it('burns out, and the turn then moves on (no soft-lock)', () => {
    const s = arena();
    fireAt(s, 'sapbomb', 1400, 590);
    run(s, 1);
    tick(s, { held: 0, pressed: 0, cmd: { t: 'skip' } }, []);
    const ev = runUntilPhase(s, 'start', 2000);
    expect(s.flames).toHaveLength(0);
    expect(ev.some((e) => e.t === 'turnStart')).toBe(true);
  });

  it('is put out by water', () => {
    const s = arena();
    s.flames.push({ id: 1, x: 50, y: s.waterY - 5, vx: 0, vy: 2, life: 200, resting: false, acid: false });
    run(s, 5);
    expect(s.flames).toHaveLength(0);
  });

  it('Acid Rain drops canisters that spill acid', () => {
    const s = arena();
    tick(s, { held: 0, pressed: 0, cmd: { t: 'weapon', id: 'acidrain' } }, []);
    tick(s, { held: 0, pressed: 0, cmd: { t: 'target', x: 1500, y: 590 } }, []);
    run(s, 1, { held: BTN_FIRE, pressed: 0 });
    expect(s.projectiles.filter((p) => p.weapon === 'aciddrop')).toHaveLength(5);
    run(s, 200);
    expect(s.flames.length).toBeGreaterThan(0);
    expect(s.flames.every((f) => f.acid)).toBe(true);
  });
});
