import { describe, expect, it } from 'vitest';
import { activeTardi, TARDI_R } from '../src/sim/world';
import type { WorldState } from '../src/sim/types';
import { walkTo } from '../src/ai/cpu';
import { makeWorld, runUntilPhase } from './helpers';

/** A flat floor at y=600 from x=100 to 1500 (water beyond), a 12px step at x=1150, the active tardi at x=1000. */
function arena(): WorldState {
  const s = makeWorld();
  const t = s.terrain;
  t.mask.fill(0);
  for (let y = 600; y < t.h; y++) for (let x = 100; x < 1500; x++) t.mask[y * t.w + x] = 1;
  for (let y = 588; y < 600; y++) for (let x = 1150; x < 1500; x++) t.mask[y * t.w + x] = 1;
  s.objects = [];
  s.scheme.crateChance = 0;
  const me = activeTardi(s)!;
  s.tardis.forEach((o, i) => {
    o.x = o === me ? 1000 : 200 + i * 40;
    o.y = 600 - TARDI_R - 1;
    o.airborne = false;
    o.vx = o.vy = 0;
  });
  runUntilPhase(s, 'aim');
  return s;
}

describe('CPU walking', () => {
  it('walks, hopping up a step it can’t climb, and says which buttons get it there', () => {
    const s = arena();
    const me = activeTardi(s)!;
    const w = walkTo(s, 1, 300);
    expect(w).not.toBeNull();
    const there = activeTardi(w!.end)!;
    expect(there.x).toBeGreaterThan(1160); // past the step
    expect(there.airborne).toBe(false);
    expect(w!.frames.some((f) => f.pressed !== 0)).toBe(true); // it jumped
    expect(me.x).toBe(1000); // the real world is untouched
  });

  it('won’t walk off into the water', () => {
    const s = arena();
    activeTardi(s)!.x = 1460;
    s.tardis.find((t) => t === activeTardi(s))!.y = 588 - TARDI_R - 1;
    expect(walkTo(s, 1, 170)).toBeNull();
  });
});
