import { describe, expect, it } from 'vitest';
import { playMatch, replayMoments } from '../scripts/videos/scout';
import { decodeWorld } from '../src/net/snapshot';
import { unpackFrames } from '../src/challenge/daily';
import { cleanFrame } from '../src/net/protocol';
import { tick, hashWorld } from '../src/sim/world';
import type { SimEvent } from '../src/sim/types';

// The video scout (scripts/videos/scout.ts) plays CPU-only matches without drawing
// them; the renderer films them from the replay. They must be the same match.
describe('video scout', () => {
  it('keeps a replay that plays out exactly as the scouted match did, with its moments inside it', () => {
    const real = Math.random;
    try {
      const m = playMatch(11, [2, 3]);
      expect(m.moments.length).toBeGreaterThan(0);
      for (const x of m.moments) {
        expect(x.from).toBeLessThan(x.to);
        expect(x.to).toBeLessThanOrEqual(m.ticks);
        // The whole of it: from before the shot to after the big moment and the damage being counted.
        expect(x.from).toBeLessThanOrEqual(x.fire!);
        expect(x.peak).toBeGreaterThanOrEqual(x.fire!);
        expect(x.peak).toBeLessThan(x.to);
        if (x.tally! >= 0) expect(x.tally!).toBeLessThan(x.to);
      }
      // The big moment is the hit, not the damage being counted seconds later (after the retreat time).
      expect(m.moments.some((x) => x.tally! > x.peak)).toBe(true);
      // Worked out again from the saved replay (--remark): the same moments.
      expect(replayMoments(m.replay).moments).toEqual(m.moments);
      const s = decodeWorld(m.replay.start);
      const frames = unpackFrames(m.replay.frames, cleanFrame)!;
      expect(frames.length).toBe(m.ticks);
      const events: SimEvent[] = [];
      for (const f of frames) {
        tick(s, f, events);
        events.length = 0;
      }
      expect(s.tick).toBe(m.ticks);
      // Played again from the start, the same match: same end, same world.
      const again = playMatch(11, [2, 3]);
      expect(again.ticks).toBe(m.ticks);
      expect(again.winner).toBe(m.winner);
      const s2 = decodeWorld(again.replay.start);
      for (const f of unpackFrames(again.replay.frames, cleanFrame)!) tick(s2, f, events);
      expect(hashWorld(s2)).toBe(hashWorld(s));
      expect(s.turn.phase).toBe('gameover');
    } finally {
      Math.random = real;
    }
  }, 120_000);
});
