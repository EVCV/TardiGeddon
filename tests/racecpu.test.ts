import { describe, expect, it } from 'vitest';
import { createWorld, tick } from '../src/sim/world';
import { presetScheme } from '../src/sim/schemes';
import { CpuPlayer } from '../src/ai/cpu';
import { TICK_RATE, type SimEvent } from '../src/sim/types';
import { runUntilPhase } from './helpers';

/** One CPU go round a Rope Race course: seconds to the flag, or -1. */
function cpuRace(seed: number, skill: 'perfect' | 'normal' = 'perfect'): number {
  const s = createWorld({ seed, teams: [{ name: 'A', color: 1, cpu: true }, { name: 'B', color: 2, cpu: true }], scheme: presetScheme('roperace') });
  runUntilPhase(s, 'aim');
  const cpu = new CpuPlayer(skill, Infinity);
  const start = s.tick;
  const ev: SimEvent[] = [];
  for (let i = 0; i < s.scheme.turnTime * TICK_RATE + 10 && s.turn.phase === 'aim'; i++) {
    ev.length = 0;
    tick(s, cpu.next(s), ev);
    if (ev.some((e) => e.t === 'finish')) return (s.tick - start) / TICK_RATE;
  }
  return -1;
}

describe('Rope Race CPU', () => {
  it('ropes its way to the flag, mines and all, on nearly every course', () => {
    const times: number[] = [];
    for (let seed = 1; seed <= 12; seed++) times.push(cpuRace(seed * 7919));
    const done = times.filter((t) => t >= 0);
    expect(done.length).toBeGreaterThanOrEqual(10);
    expect(done.reduce((a, b) => a + b, 0) / done.length).toBeLessThan(40);
  }, 120000);
});
