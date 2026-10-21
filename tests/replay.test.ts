import { describe, expect, it } from 'vitest';
import { cloneWorld, createWorld, tick } from '../src/sim/world';
import { CpuPlayer } from '../src/ai/cpu';
import type { SimEvent } from '../src/sim/types';
import { TurnRecorder } from '../src/stats/replay';
import { MatchTally } from '../src/stats/tally';

describe('winning-shot replay and match stats', () => {
  it('replays the deciding turn from its start to the very same ending, and counts everyone’s numbers', () => {
    const s = createWorld({
      seed: 12345,
      teams: [
        { name: 'A', color: 1, cpu: true },
        { name: 'B', color: 2, cpu: true },
      ],
      scheme: { tardisPerTeam: 2, mapStyle: 'islands', startHp: 40 },
    });
    const cpus = [new CpuPlayer('perfect'), new CpuPlayer('perfect')];
    const rec = new TurnRecorder();
    const stats = new MatchTally(2);
    const ev: SimEvent[] = [];
    for (let i = 0; i < 50 * 60 * 15 && s.turn.phase !== 'gameover'; i++) {
      const f = cpus[s.turn.teamIdx].next(s);
      rec.before(s, f);
      tick(s, f, ev);
      rec.after(ev);
      stats.add(s, ev);
      ev.length = 0;
    }
    expect(s.turn.phase).toBe('gameover');
    const shot = rec.winningShot();
    expect(shot).not.toBeNull();
    // Played again on its own copy, it ends the same way.
    const again = cloneWorld(shot!.start);
    const replayEvents: SimEvent[] = [];
    for (const f of shot!.frames) tick(again, f, replayEvents);
    expect(replayEvents.some((e) => e.t === 'fire')).toBe(true);
    expect(again.turn.phase).toBe('gameover');
    expect(again.turn.winner).toBe(s.turn.winner);
    expect(again.tardis.map((t) => [t.hp, t.alive])).toEqual(s.tardis.map((t) => [t.hp, t.alive]));

    const w = stats.teams[s.turn.winner];
    expect(w.shots).toBeGreaterThan(0);
    expect(w.popped).toBeGreaterThan(0);
    expect(w.bestTurn).toBeGreaterThan(0);
    expect(w.bestTurn).toBeLessThanOrEqual(w.damage);
  }, 60_000);
});
