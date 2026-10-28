import { describe, expect, it } from 'vitest';
import { activeTardi } from '../src/sim/world';
import { BTN_RIGHT, PRESS_JUMP } from '../src/sim/types';
import { makeWorld, run, runUntilPhase } from './helpers';

describe('a tardi wedged between two lumps of land', () => {
  it('comes to rest there (and can hop out), instead of falling forever', () => {
    const s = makeWorld();
    runUntilPhase(s, 'aim');
    const t = activeTardi(s)!;
    const { w, mask } = s.terrain;
    // High in the sky: clear a space, then two lumps (as blasts leave them)
    // that it drops between, touching both sides with nothing flat underneath.
    const x0 = Math.round(t.x);
    const y0 = 80;
    for (let y = 10; y < 170; y++) for (let x = x0 - 70; x < x0 + 70; x++) mask[y * w + x] = 0;
    for (const [bx, by, r] of [
      [-16, 13, 8],
      [17, 26, 5],
    ]) {
      for (let y = y0 + by - r; y <= y0 + by + r; y++) {
        for (let x = x0 + bx - r; x <= x0 + bx + r; x++) if ((x - x0 - bx) * (x - x0 - bx) + (y - y0 - by) * (y - y0 - by) <= r * r) mask[y * w + x] = 1;
      }
    }
    t.x = x0 - 1;
    t.y = y0 - 20;
    t.airborne = true;
    t.vx = 0;
    t.vy = 0;
    run(s, 200);
    expect(t.airborne).toBe(false);
    expect(s.turn.phase).toBe('aim');
    // Still your go, and you can hop out.
    const was = { x: t.x, y: t.y };
    run(s, 1, { held: 0, pressed: PRESS_JUMP });
    run(s, 60, { held: BTN_RIGHT, pressed: 0 });
    expect(Math.abs(t.y - was.y) + Math.abs(t.x - was.x)).toBeGreaterThan(5);
  });
});
