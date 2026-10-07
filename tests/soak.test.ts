import { describe, expect, it } from 'vitest';
import { createWorld, tick } from '../src/sim/world';
import { CpuPlayer } from '../src/ai/cpu';
import type { SimEvent } from '../src/sim/types';

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
      const cpus = [new CpuPlayer('perfect'), new CpuPlayer('perfect')];
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
