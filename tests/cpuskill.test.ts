import { afterEach, describe, expect, it, vi } from 'vitest';
import { createWorld, tick } from '../src/sim/world';
import { EMPTY_INPUT } from '../src/sim/types';
import { presetScheme } from '../src/sim/schemes';
import { CpuPlayer, type CpuSkill } from '../src/ai/cpu';
import { createRng, rngFloat } from '../src/sim/math/prng';

/** Total damage a CPU deals to a team that never moves, over a few turns on a few maps. */
function damageDealt(skill: CpuSkill): number {
  let dealt = 0;
  for (let seed = 1; seed <= 6; seed++) {
    const s = createWorld({
      seed,
      teams: [
        { name: 'H', color: 1, cpu: false },
        { name: 'C', color: 2, cpu: true },
      ],
      scheme: { ...presetScheme('standard'), mines: 0, drums: 0, crateChance: 0 },
    });
    const cpu = new CpuPlayer(skill);
    let turns = 0;
    while (turns < 4 && s.turn.phase !== 'gameover') {
      if (s.turn.phase === 'aim' && s.turn.teamIdx === 0) {
        tick(s, { held: 0, pressed: 0, cmd: { t: 'skip' } }, []);
      } else if (s.turn.phase === 'aim') {
        const before = s.tardis.filter((t) => t.team === 0).reduce((a, t) => a + t.hp, 0);
        while (s.turn.phase !== 'gameover' && !(s.turn.phase === 'start' && s.turn.teamIdx === 0)) tick(s, cpu.next(s), []);
        dealt += before - s.tardis.filter((t) => t.team === 0).reduce((a, t) => a + t.hp, 0);
        turns++;
      } else tick(s, EMPTY_INPUT, []);
    }
  }
  return dealt;
}

describe('CPU skill levels', () => {
  afterEach(() => vi.restoreAllMocks());

  it('miss more the easier they are', () => {
    // Make the CPU's dice repeatable.
    const rng = createRng(99);
    vi.spyOn(Math, 'random').mockImplementation(() => rngFloat(rng));
    const easy = damageDealt('easy');
    const hard = damageDealt('hard');
    const perfect = damageDealt('perfect');
    expect(easy).toBeLessThan(hard);
    expect(hard).toBeLessThan(perfect);
    expect(easy).toBeLessThan(perfect * 0.6);
  }, 120_000);
});
