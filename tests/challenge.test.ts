import { describe, expect, it } from 'vitest';
import { createWorld, tick } from '../src/sim/world';
import { CpuPlayer } from '../src/ai/cpu';
import type { InputFrame, SimEvent } from '../src/sim/types';
import { cleanFrame } from '../server/room';
import {
  ChallengeRun,
  challengeDay,
  challengeScore,
  challengeSeed,
  challengeWorld,
  packFrames,
  playBack,
  unpackFrames,
  MAX_FRAMES,
  TARGET_TURNS,
  type ChallengeKind,
} from '../src/challenge/daily';

const you = { name: 'Me', color: 0xe04848, cpu: false };

/** Play a challenge with the CPU's brain in charge of our team, as the game would record it. */
function play(kind: ChallengeKind, day: string) {
  const s = createWorld(challengeWorld(kind, day, you));
  const run = new ChallengeRun(kind, day);
  const brain = new CpuPlayer('perfect');
  const ev: SimEvent[] = [];
  for (let i = 0; i < MAX_FRAMES && !run.over; i++) {
    const f = run.frameFor(s, s.turn.teamIdx === 0 ? brain.next(s) : { held: 0, pressed: 0 });
    tick(s, f, ev);
    run.played(s, f, ev);
    ev.length = 0;
  }
  return { s, run };
}

describe('daily challenges', () => {
  it('are the same for everyone on a day, and new each day', () => {
    expect(challengeDay(new Date('2026-10-21T23:59:00Z'))).toBe('2026-10-21');
    expect(challengeSeed('2026-10-21', 'targets')).toBe(challengeSeed('2026-10-21', 'targets'));
    expect(challengeSeed('2026-10-21', 'targets')).not.toBe(challengeSeed('2026-10-22', 'targets'));
    expect(challengeSeed('2026-10-21', 'targets')).not.toBe(challengeSeed('2026-10-21', 'rope'));
    const a = createWorld(challengeWorld('targets', '2026-10-21', you));
    const b = createWorld(challengeWorld('targets', '2026-10-21', { ...you, name: 'Someone else', color: 0x3a7be0 }));
    expect(a.tardis.map((t) => [t.x, t.y])).toEqual(b.tardis.map((t) => [t.x, t.y]));
  });

  it('scores a run the same when the server plays the frames back, and stops after the last turn', () => {
    const { s, run } = play('targets', '2026-10-21');
    const mine = run.result(s);
    expect(mine.done).toBe(true);
    expect(mine.value).toBeGreaterThan(0);
    const frames = unpackFrames(JSON.parse(JSON.stringify(run.packed())), cleanFrame)!;
    expect(frames.length).toBe(run.frames.length);
    // Small enough to send (the server takes up to 64 KB).
    expect(JSON.stringify(run.packed()).length).toBeLessThan(16 * 1024);
    expect(playBack('targets', '2026-10-21', you, frames)).toEqual(mine);
    // More frames than the run used change nothing.
    expect(playBack('targets', '2026-10-21', you, [...frames, ...frames.slice(0, 500)])).toEqual(mine);
    // A turn limit, not a time limit: no more than TARGET_TURNS of ours.
    let mineTurns = 0;
    const w = createWorld(challengeWorld('targets', '2026-10-21', you));
    const ev: SimEvent[] = [];
    for (const f of frames) {
      tick(w, f, ev);
      mineTurns += ev.filter((e) => e.t === 'turnStart' && e.team === 0).length;
      ev.length = 0;
    }
    expect(mineTurns).toBeLessThanOrEqual(TARGET_TURNS + 1);
  }, 60_000);

  it('ignores whatever is sent for the stand-in team', () => {
    const { s, run } = play('targets', '2026-10-22');
    const honest = run.result(s);
    // A cheat sends Fire for every frame; the targets' turns still just skip.
    const doctored: InputFrame[] = run.frames.map((f) => (f.cmd?.t === 'skip' ? { held: 16, pressed: 1 } : f));
    expect(playBack('targets', '2026-10-22', you, doctored).value).toBe(honest.value);
  }, 60_000);

  it('turns a rope race into the best time of three tries', () => {
    const s = createWorld(challengeWorld('rope', '2026-10-21', you));
    expect(s.race).not.toBeNull();
    expect(s.teams[0].ammo.rope).toBe(-1);
    // Doing nothing: never finishes, the lowest score.
    const idle = playBack('rope', '2026-10-21', you, Array.from({ length: MAX_FRAMES }, () => ({ held: 0, pressed: 0 })));
    expect(idle).toMatchObject({ value: -1, done: true, score: -1 });
    expect(challengeScore('rope', 500, 0)).toBeGreaterThan(challengeScore('rope', 900, 0));
    expect(challengeScore('targets', 3, 9000)).toBeGreaterThan(challengeScore('targets', 2, 10));
    expect(challengeScore('targets', 3, 100)).toBeGreaterThan(challengeScore('targets', 3, 9000));
  }, 60_000);

  it('refuses runs that aren’t frames or are too long', () => {
    expect(unpackFrames('nope', cleanFrame)).toBeNull();
    expect(unpackFrames([-(MAX_FRAMES + 1)], cleanFrame)).toBeNull();
    expect(unpackFrames([1.5], cleanFrame)).toBeNull();
    expect(unpackFrames([-3, [16, 0], -2], cleanFrame)).toHaveLength(6);
    const held = { held: 16, pressed: 0 };
    expect(packFrames([{ held: 0, pressed: 0 }, { held: 0, pressed: 0 }, held, held, held])).toEqual([-2, [16, 0], 2]);
    expect(unpackFrames([-2, [16, 0], 2], cleanFrame)).toEqual([{ held: 0, pressed: 0 }, { held: 0, pressed: 0 }, held, held, held]);
    expect(unpackFrames([3], cleanFrame)).toBeNull(); // nothing to repeat
    expect(unpackFrames([0], cleanFrame)).toBeNull();
  });
});
