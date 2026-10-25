import { describe, expect, it } from 'vitest';
import { createWorld, tick, FULL_HOLD_TICKS, POWER_MAX } from '../src/sim/world';
import { BTN_FIRE, EMPTY_INPUT, type ChargeStyle, type SimEvent } from '../src/sim/types';
import { runUntilPhase } from './helpers';

/** A match whose first team charges throws `charge`'s way, at its first aim. */
function aiming(charge?: ChargeStyle) {
  const s = createWorld({ seed: 5, teams: [{ name: 'A', color: 1, cpu: false, charge }, { name: 'B', color: 2, cpu: false }], scheme: { mines: 0, drums: 0, crateChance: 0, windMax: 0 } });
  runUntilPhase(s, 'aim');
  // Team A's turn, with the bazooka.
  while (s.turn.teamIdx !== 0) {
    tick(s, { ...EMPTY_INPUT, cmd: { t: 'skip' } }, []);
    runUntilPhase(s, 'aim');
  }
  tick(s, { held: 0, pressed: 0, cmd: { t: 'weapon', id: 'bazooka' } }, []);
  return s;
}

/** Hold Fire for `n` ticks: the power each tick, and whether it went off. */
function hold(charge: ChargeStyle | undefined, n: number) {
  const s = aiming(charge);
  const powers: number[] = [];
  let fired = false;
  for (let i = 0; i < n && !fired; i++) {
    const ev: SimEvent[] = [];
    tick(s, { held: BTN_FIRE, pressed: 0 }, ev);
    powers.push(s.turn.power);
    fired = ev.some((e) => e.t === 'fire');
  }
  return { powers, fired, s };
}

describe('the power bar (Settings → Controls)', () => {
  it('normally fills, then throws by itself after a moment at full power', () => {
    const r = hold(undefined, 200);
    expect(r.fired).toBe(true);
    expect(r.powers.indexOf(POWER_MAX)).toBe(POWER_MAX / 20 - 1);
    expect(r.powers.length).toBeLessThan(POWER_MAX / 20 + FULL_HOLD_TICKS + 3);
  });

  it('fills at half speed when slower', () => {
    const r = hold('slow', 300);
    expect(r.powers.indexOf(POWER_MAX)).toBe(POWER_MAX / 10 - 1);
    expect(r.fired).toBe(true);
  });

  it('goes back down and up again, never throwing by itself, until Fire is let go', () => {
    const r = hold('bounce', 400);
    expect(r.fired).toBe(false);
    const top = r.powers.indexOf(POWER_MAX);
    expect(r.powers[top + 10]).toBeLessThan(POWER_MAX);
    expect(Math.min(...r.powers.slice(top))).toBeGreaterThan(0);
    // It comes back up after the bottom.
    expect(r.powers.lastIndexOf(POWER_MAX)).toBeGreaterThan(top);
    // Letting go throws at the power shown.
    const at = r.s.turn.power;
    const ev: SimEvent[] = [];
    tick(r.s, EMPTY_INPUT, ev);
    expect(ev.some((e) => e.t === 'fire')).toBe(true);
    expect(at).toBeGreaterThan(0);
  });

  it('only changes the team that chose it', () => {
    const s = createWorld({ seed: 5, teams: [{ name: 'A', color: 1, cpu: false, charge: 'slowbounce' }, { name: 'B', color: 2, cpu: true, charge: 'nonsense' as ChargeStyle }] });
    expect(s.teams.map((t) => t.charge)).toEqual(['slowbounce', 'normal']);
  });
});
