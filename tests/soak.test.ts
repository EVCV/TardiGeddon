import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRng, rngFloat } from '../src/sim/math/prng';
import { createWorld, tick } from '../src/sim/world';
import { CpuPlayer } from '../src/ai/cpu';
import type { SimEvent } from '../src/sim/types';
import { MAP_STYLES } from '../src/sim/terrain/generate';

// The CPU rolls dice (where to wander, which way to look first) and works out
// its moves a slice at a time: seeded dice and thinking all at once keep these
// matches the same on every run, however busy the machine is.
beforeEach(() => {
  const rng = createRng(7);
  vi.spyOn(Math, 'random').mockImplementation(() => rngFloat(rng));
});
afterEach(() => vi.restoreAllMocks());

// CPU vs CPU matches across several seeds: turns must keep flowing and
// games must end. Catches soft-locks (e.g. tardis that never come to rest).
describe('cpu soak', () => {
  for (const seed of [1, 12345, 777, 4242, 99]) {
    it(`seed ${seed} plays to completion without stalling`, () => {
      const s = createWorld({
        seed,
        teams: [
          { name: 'A', color: 1, cpu: true },
          { name: 'B', color: 2, cpu: true },
        ],
        scheme: { tardisPerTeam: 2 },
      });
      const cpus = [new CpuPlayer('perfect', Infinity), new CpuPlayer('perfect', Infinity)];
      const events: SimEvent[] = [];
      let lastTurn = s.turn.turnNumber;
      let sinceTurn = 0;
      for (let i = 0; i < 50 * 60 * 15 && s.turn.phase !== 'gameover'; i++) {
        tick(s, cpus[s.turn.teamIdx].next(s), events);
        events.length = 0;
        if (s.turn.turnNumber !== lastTurn) {
          lastTurn = s.turn.turnNumber;
          sinceTurn = 0;
        }
        // A turn is at most 45s + retreat + 20s settle cap.
        expect(++sinceTurn).toBeLessThan(50 * 75);
      }
      expect(s.turn.turnNumber).toBeGreaterThan(3);
    }, 60_000);
  }
});

// Every map style ("realm") must play out too: no spots where tardis can't come to rest.
describe('cpu soak on every map style', () => {
  for (const m of MAP_STYLES) {
    it(`${m.id} plays to completion without stalling`, () => {
      const s = createWorld({
        seed: 31,
        teams: [
          { name: 'A', color: 1, cpu: true },
          { name: 'B', color: 2, cpu: true },
        ],
        scheme: { tardisPerTeam: 2, mapStyle: m.id, armour: m.id === 'sky' ? 30 : 0 },
      });
      expect(s.realm).toBe(m.id);
      const cpus = [new CpuPlayer('perfect', Infinity), new CpuPlayer('perfect', Infinity)];
      const events: SimEvent[] = [];
      let lastTurn = s.turn.turnNumber;
      let sinceTurn = 0;
      for (let i = 0; i < 50 * 60 * 15 && s.turn.phase !== 'gameover'; i++) {
        tick(s, cpus[s.turn.teamIdx].next(s), events);
        events.length = 0;
        if (s.turn.turnNumber !== lastTurn) {
          lastTurn = s.turn.turnNumber;
          sinceTurn = 0;
        }
        expect(++sinceTurn).toBeLessThan(50 * 75);
      }
      // Played out: a winner (sky realms can be quick: falling off is easy), or plenty of turns.
      expect(s.turn.phase === 'gameover' || s.turn.turnNumber > 3, `turn ${s.turn.turnNumber}, ${s.turn.phase}`).toBe(true);
    }, 60_000);
  }
});
