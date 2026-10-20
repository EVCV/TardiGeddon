import { afterEach, describe, expect, it, vi } from 'vitest';
import { activeTardi, cloneWorld, FULL_HOLD_TICKS, launchVelocity, POWER_MAX, POWER_STEP, stepProjectile, tick } from '../src/sim/world';
import { BTN_FIRE, BTN_UP, EMPTY_INPUT, type InputFrame, type Projectile } from '../src/sim/types';
import { WEAPONS } from '../src/sim/weapons';
import { SeenInput, connectionState, LOST_MS, SLOW_MS } from '../src/net/lockstep';
import { CpuPlayer, flightKey } from '../src/ai/cpu';
import { createRng, rngFloat } from '../src/sim/math/prng';
import { makeWorld, runUntilPhase } from './helpers';

const FIRE: InputFrame = { held: BTN_FIRE, pressed: 0 };

function aiming() {
  const s = makeWorld(77);
  runUntilPhase(s, 'aim');
  return s;
}

describe('online lag: the shot the player saw', () => {
  it('a "power" command on letting go fires with that power, never more than was charged', () => {
    /** The shot fired after holding Fire for `hold` ticks, then letting go with `cmd`. */
    const shoot = (hold: number, cmd?: InputFrame['cmd']) => {
      const s = aiming();
      for (let i = 0; i < hold; i++) tick(s, FIRE, []);
      tick(s, { held: 0, pressed: 0, cmd }, []);
      const p = s.projectiles[0];
      return { x: p.x, y: p.y, vx: p.vx, vy: p.vy };
    };
    // Charged to 600 on the server, but the player let go seeing 220 (11 ticks' worth).
    expect(shoot(30, { t: 'power', p: 220 })).toEqual(shoot(11));
    // Asking for more than was charged changes nothing.
    expect(shoot(10, { t: 'power', p: 900 })).toEqual(shoot(10));
  });

  it('at full power the shot waits a moment for the player to let go, then goes by itself', () => {
    const s = aiming();
    const full = POWER_MAX / POWER_STEP;
    for (let i = 0; i < full + FULL_HOLD_TICKS - 1; i++) tick(s, FIRE, []);
    expect(s.projectiles).toHaveLength(0);
    expect(s.turn.power).toBe(POWER_MAX);
    tick(s, FIRE, []);
    expect(s.projectiles).toHaveLength(1);
  });

  it('letting go of Fire sends the power on screen', () => {
    const s = aiming();
    for (let i = 0; i < 12; i++) tick(s, FIRE, []);
    const frames = new SeenInput().frames(EMPTY_INPUT, BTN_FIRE, s);
    expect(frames).toEqual([{ held: 0, pressed: 0, cmd: { t: 'power', p: 12 * POWER_STEP } }]);
    // A tap the screen hasn't shown charging yet goes as it is.
    const s2 = aiming();
    expect(new SeenInput().frames(EMPTY_INPUT, BTN_FIRE, s2)).toEqual([EMPTY_INPUT]);
  });

  it('letting go of ▲ sends the aim on screen, once it has been seen to move', () => {
    const s = aiming();
    const seen = new SeenInput();
    const up: InputFrame = { held: BTN_UP, pressed: 0 };
    seen.frames(up, 0, s);
    // A quick tap: the screen hasn't moved yet, so no correction.
    expect(seen.frames(EMPTY_INPUT, BTN_UP, s)).toEqual([EMPTY_INPUT]);
    seen.frames(up, 0, s);
    for (let i = 0; i < 20; i++) tick(s, up, []);
    const t = activeTardi(s)!;
    const frames = seen.frames({ held: 0, pressed: 0, cmd: { t: 'fuse', s: 2 } }, BTN_UP, s);
    expect(frames).toEqual([
      { held: 0, pressed: 0, cmd: { t: 'aim', facing: t.facing, aim: s.turn.aim } },
      { held: 0, pressed: 0, cmd: { t: 'fuse', s: 2 } },
    ]);
  });

  it('says when frames stop coming', () => {
    expect(connectionState(100)).toBe('ok');
    expect(connectionState(SLOW_MS)).toBe('slow');
    expect(connectionState(LOST_MS)).toBe('lost');
  });
});

describe('CPU thinking in slices', () => {
  afterEach(() => vi.restoreAllMocks());

  /** Play one CPU turn; returns the shot it fired and the longest single call. */
  function cpuTurn(sliceMs: number) {
    const rng = createRng(5);
    vi.spyOn(Math, 'random').mockImplementation(() => rngFloat(rng));
    const s = aiming();
    const cpu = new CpuPlayer('normal', sliceMs);
    let longest = 0;
    let ticks = 0;
    for (; ticks < 50 * 40 && s.projectiles.length === 0 && s.turn.phase === 'aim'; ticks++) {
      const t0 = performance.now();
      const f = cpu.next(s);
      longest = Math.max(longest, performance.now() - t0);
      tick(s, f, []);
    }
    vi.restoreAllMocks();
    const p = s.projectiles[0];
    return { shot: p && { weapon: p.weapon, vx: p.vx, vy: p.vy }, longest, ticks };
  }

  it('picks the same shot whether it thinks all at once or a little each tick', () => {
    const whole = cpuTurn(Infinity);
    const sliced = cpuTurn(0); // one candidate per tick: the slowest it can go
    expect(whole.shot).toBeTruthy();
    expect(sliced.shot).toEqual(whole.shot);
    expect(sliced.ticks).toBeGreaterThan(whole.ticks);
  }, 60_000);

  it('never holds up a tick for long', () => {
    // Thinking all at once takes a few hundred ms; a slice is a few.
    expect(cpuTurn(4).longest).toBeLessThan(60);
  }, 60_000);

  it('weapons that share a flight key fly the same path', () => {
    const s = aiming();
    const t = activeTardi(s)!;
    for (const [a, b] of [['bazooka', 'mortar'], ['grenade', 'cluster']]) {
      expect(flightKey(a)).toBe(flightKey(b));
      for (const aim of [-300, 0, 200, 500]) {
        const land = (weapon: string) => {
          const sim = cloneWorld(s);
          const spec = WEAPONS[weapon].projectile!;
          const { vx, vy } = launchVelocity(spec, 1, aim, 700);
          const p: Projectile = { id: -1, weapon, x: t.x, y: t.y, vx, vy, fuse: 150, owner: t.id, age: 0, tx: 0, ty: 0, dir: 0, hits: 0 };
          for (let i = 0; i < 400; i++) {
            const r = stepProjectile(sim, p, null);
            if (r.k !== 'alive') return r;
          }
          return null;
        };
        expect(land(b)).toEqual(land(a));
      }
    }
    expect(flightKey('bazooka')).not.toBe(flightKey('grenade'));
  });
});
