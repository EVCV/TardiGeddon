import { describe, expect, it } from 'vitest';
import { createWorld, tick } from '../src/sim/world';
import { presetScheme } from '../src/sim/schemes';
import { CpuPlayer, SKILL_DEFS, choosePlan, type Planner } from '../src/ai/cpu';
import type { SimEvent } from '../src/sim/types';

// The background match behind the menu plans CPU shots in a Web Worker: the
// plan arrives a little later, and the CPU must wait for it, then shoot.
describe('CPU with an async planner', () => {
  it('waits for the plan, then fires on its turn', async () => {
    const s = createWorld({
      seed: 3,
      teams: [
        { name: 'A', color: 1, cpu: true },
        { name: 'B', color: 2, cpu: true },
      ],
      scheme: { ...presetScheme('standard'), mines: 0, drums: 0 },
    });
    let asked = 0;
    // A planner that answers after a few ticks, like a worker would.
    let release = null as (() => void) | null;
    const planner: Planner = (w, skill) => {
      asked++;
      const plan = choosePlan(structuredClone(w), SKILL_DEFS[skill]);
      return new Promise((resolve) => (release = () => resolve(plan)));
    };
    const cpus = [new CpuPlayer('hard', planner), new CpuPlayer('hard', planner)];
    const events: SimEvent[] = [];
    let fired = false;
    for (let i = 0; i < 50 * 30 && !fired; i++) {
      tick(s, cpus[s.turn.teamIdx].next(s), events);
      // The answer lands 60 ticks (over a second) after the question.
      if (release && i % 60 === 59) {
        release();
        release = null;
        await Promise.resolve();
      }
      fired = events.some((e) => e.t === 'fire' || e.t === 'shot');
    }
    expect(asked).toBeGreaterThan(0);
    expect(fired).toBe(true);
  });
});
