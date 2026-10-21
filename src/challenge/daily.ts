// Daily challenges: the same solo puzzle for everyone each day (UTC), with a
// leaderboard. DOM-free and shared with the game server, which never trusts
// a score from a player: the game sends the run's input frames, and the
// server plays them through this same deterministic sim to get the score.
//
// - Targets: pop as many target dummies as you can in TARGET_TURNS turns
//   (ties: fewer seconds). Same map, wind and targets for everyone.
// - Rope Race: the day's course; your best of three tries (lower is better).

import { createWorld, tick, type TeamConfig, type WorldConfig } from '../sim/world';
import { EMPTY_INPUT, TICK_RATE, type InputFrame, type SimEvent, type WorldState } from '../sim/types';
import { presetScheme } from '../sim/schemes';
import { MAP_STYLES } from '../sim/terrain/generate';
import { fromWire, toWire, type WireFrame } from '../net/protocol';

export type ChallengeKind = 'targets' | 'rope';
export const CHALLENGE_KINDS: ChallengeKind[] = ['targets', 'rope'];

export function isChallengeKind(v: unknown): v is ChallengeKind {
  return v === 'targets' || v === 'rope';
}

/** Your turns in the Targets challenge. */
export const TARGET_TURNS = 8;
export const TARGET_COUNT = 8;
/** Longest run the server will play through (15 minutes of game time). */
export const MAX_FRAMES = TICK_RATE * 60 * 15;

/** Today's challenge day, "YYYY-MM-DD" in UTC, so it's the same day for everyone. */
export function challengeDay(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/** A seed from the day and the kind (FNV-1a), so each day is new but the same for everyone. */
export function challengeSeed(day: string, kind: ChallengeKind): number {
  let h = 0x811c9dc5;
  for (const c of `${kind}:${day}`) {
    h ^= c.charCodeAt(0);
    h = Math.imul(h, 0x01000193);
  }
  return h | 0;
}

/** The day's target dummies (team 1); they do nothing. */
const TARGETS: TeamConfig = {
  name: 'Targets',
  color: 0x9aa4ad,
  cpu: true,
  names: Array.from({ length: TARGET_COUNT }, (_, i) => `Target ${i + 1}`),
};

/** In the Rope Race challenge, a stand-in second team that never races. */
const GHOST: TeamConfig = { name: 'Ghost', color: 0x9aa4ad, cpu: true, names: ['Ghost'] };

/** The match for a challenge day. Your team's looks are yours; nothing else is. */
export function challengeWorld(kind: ChallengeKind, day: string, you: TeamConfig): WorldConfig {
  const seed = challengeSeed(day, kind);
  const player = { ...you, cpu: false, names: you.names?.slice(0, 1) };
  if (kind === 'rope') {
    return { seed, teams: [player, GHOST], scheme: { ...presetScheme('roperace'), raceRounds: 3 } };
  }
  return {
    seed,
    teams: [player, TARGETS],
    scheme: {
      ...presetScheme('standard'),
      practiceTargets: TARGET_COUNT,
      turnTime: 30,
      retreatTime: 3,
      mines: 0,
      drums: 4,
      crateChance: 0,
      windMax: 1,
      roundTime: 60,
      supers: 0,
      weapons: undefined,
      unlocked: [],
      weather: false,
      // A different kind of map each day, the same for everyone.
      mapStyle: MAP_STYLES[(seed >>> 0) % MAP_STYLES.length].id,
    },
  };
}

/** How a run went. `score` sorts the leaderboard: higher is better. */
export interface ChallengeResult {
  /** Targets: targets popped. Rope: best time in ticks (-1 if never finished). */
  value: number;
  /** Ticks played. */
  ticks: number;
  /** For sorting: higher is better. */
  score: number;
  /** The run reached its end (all targets or all turns; all three tries). */
  done: boolean;
}

/** Leaderboard order: higher is better. */
export function challengeScore(kind: ChallengeKind, value: number, ticks: number): number {
  if (kind === 'rope') return value < 0 ? -1 : MAX_FRAMES - value;
  return value * (MAX_FRAMES + 1) + (MAX_FRAMES - Math.min(MAX_FRAMES, ticks));
}

/** Has the run ended? (Checked after every tick, by the game and the server alike.) */
export function challengeOver(kind: ChallengeKind, s: WorldState, myTurnsStarted: number): boolean {
  if (s.turn.phase === 'gameover') return true;
  return kind === 'targets' && myTurnsStarted > TARGET_TURNS;
}

/** The frame the stand-in team plays: it ends its turn at once. */
export const SKIP_FRAME: InputFrame = { ...EMPTY_INPUT, cmd: { t: 'skip' } };

/**
 * Keeps track of a challenge run as it's played (in the game) or played back
 * (on the server): counts your turns and says when it's over.
 */
export class ChallengeRun {
  readonly frames: InputFrame[] = [];
  private myTurns = 0;
  private endTick = -1;

  constructor(
    readonly kind: ChallengeKind,
    readonly day: string,
  ) {}

  /** Who moves this tick: the player, or the stand-in team (which always skips). */
  frameFor(s: WorldState, playerFrame: InputFrame): InputFrame {
    return s.turn.teamIdx === 0 ? playerFrame : SKIP_FRAME;
  }

  /** Record a played frame and its events; returns true once the run is over. */
  played(s: WorldState, f: InputFrame, events: readonly SimEvent[]): boolean {
    this.frames.push(f);
    for (const e of events) if (e.t === 'turnStart' && e.team === 0) this.myTurns++;
    if (this.endTick < 0 && challengeOver(this.kind, s, this.myTurns)) this.endTick = s.tick;
    return this.endTick >= 0;
  }

  /** Your turns started so far. */
  get turns(): number {
    return this.myTurns;
  }

  get over(): boolean {
    return this.endTick >= 0;
  }

  result(s: WorldState): ChallengeResult {
    const value = this.kind === 'rope' ? (s.race?.best[0] ?? -1) : (s.practice?.popped ?? 0);
    const ticks = this.endTick >= 0 ? this.endTick : s.tick;
    return { value, ticks, score: challengeScore(this.kind, value, ticks), done: this.over };
  }

  /** The frames to send to the server, compactly: runs of empty frames as numbers. */
  packed(): (WireFrame | number)[] {
    return packFrames(this.frames);
  }
}

/**
 * Packed for sending: a run of empty frames becomes a negative count, a frame
 * repeated (a button held down) becomes the frame then a positive count of
 * repeats, and anything else goes as on the wire.
 */
export function packFrames(frames: readonly InputFrame[]): (WireFrame | number)[] {
  const out: (WireFrame | number)[] = [];
  let empties = 0;
  let prev = '';
  let repeats = 0;
  const flush = () => {
    if (empties) out.push(-empties);
    if (repeats) out.push(repeats);
    empties = repeats = 0;
  };
  for (const f of frames) {
    const w = toWire(f);
    if (w === 0) {
      if (repeats) flush();
      empties++;
      prev = '';
      continue;
    }
    const key = JSON.stringify(w);
    if (key === prev && !f.cmd) {
      repeats++;
      continue;
    }
    flush();
    out.push(w);
    prev = f.cmd ? '' : key;
  }
  flush();
  return out;
}

/** Undo packFrames, or null if it isn't a sane run (too long, not frames). */
export function unpackFrames(packed: unknown, clean: (w: unknown) => InputFrame): InputFrame[] | null {
  if (!Array.isArray(packed) || packed.length > MAX_FRAMES) return null;
  const out: InputFrame[] = [];
  let last: InputFrame | null = null;
  for (const p of packed) {
    if (typeof p === 'number') {
      if (!Number.isInteger(p) || p === 0 || out.length + Math.abs(p) > MAX_FRAMES) return null;
      if (p > 0 && !last) return null;
      const f = p < 0 ? fromWire(0) : last!;
      for (let i = 0; i < Math.abs(p); i++) out.push({ ...f });
      if (p < 0) last = null;
    } else {
      last = clean(p);
      out.push(last);
      if (out.length > MAX_FRAMES) return null;
    }
  }
  return out;
}

/**
 * The server's check: play the frames on the day's world and see what really
 * happened. The stand-in team's frames are replaced by skips whatever was
 * sent, and anything after the run's end is ignored.
 */
export function playBack(kind: ChallengeKind, day: string, you: TeamConfig, frames: readonly InputFrame[]): ChallengeResult {
  const s = createWorld(challengeWorld(kind, day, you));
  const run = new ChallengeRun(kind, day);
  const events: SimEvent[] = [];
  for (const f of frames) {
    const played = run.frameFor(s, f);
    tick(s, played, events);
    const over = run.played(s, played, events);
    events.length = 0;
    if (over) break;
  }
  return run.result(s);
}
