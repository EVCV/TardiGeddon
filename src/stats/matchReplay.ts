// Whole-match replays: the world as the match began (a snapshot, as online
// rejoin uses) and every input frame after it. The sim is deterministic, so
// playing the frames on that world shows exactly what happened. DOM-free.

import { encodeWorld } from '../net/snapshot';
import { packFrames } from '../challenge/daily';
import { mapStyleName } from '../sim/terrain/generate';
import type { InputFrame, WorldState } from '../sim/types';
import type { WireFrame } from '../net/protocol';
import { t } from '../i18n/i18n';

export const REPLAY_VERSION = 1;

export interface MatchReplay {
  v: number;
  /** When it was played (ms since 1970). */
  at: number;
  /** "Water Bears vs Moss Mob". */
  title: string;
  /** "Sky Realms · Water Bears won". */
  summary: string;
  /** The world as the recording began (net/snapshot encodeWorld). */
  start: string;
  /** The input frames (challenge/daily packFrames). */
  frames: (WireFrame | number)[];
  ticks: number;
}

export class MatchRecorder {
  private start: string | null = null;
  private frames: InputFrame[] = [];
  private names: string[] = [];

  /** Begin with the world as it is now (the first tick, or where an online rejoin came in). */
  begin(s: WorldState): void {
    this.start = encodeWorld(s);
    this.frames = [];
    this.names = s.teams.map((t) => t.name);
  }

  get recording(): boolean {
    return this.start !== null;
  }

  /** Each frame played, in order. */
  frame(f: InputFrame): void {
    if (this.start) this.frames.push(f);
  }

  /** The finished replay. */
  finish(s: WorldState, teamLabel: (id: number) => string): MatchReplay | null {
    if (!this.start || this.frames.length === 0) return null;
    const w = s.turn.winner;
    const title = this.names.length > 3 ? t('{n} teams', { n: this.names.length }) : s.teams.map((x) => teamLabel(x.id)).join(t(' vs '));
    // In the player's language when it's saved.
    const summary = w >= 0 ? t('{map} · {team} won', { map: t(mapStyleName(s.realm)), team: teamLabel(w) }) : t('{map} · a draw', { map: t(mapStyleName(s.realm)) });
    return { v: REPLAY_VERSION, at: Date.now(), title, summary, start: this.start, frames: packFrames(this.frames), ticks: this.frames.length };
  }
}

/** Is this (from a file someone sent, or storage) the shape of a replay? */
export function isReplay(v: unknown): v is MatchReplay {
  const r = v as MatchReplay;
  return (
    !!r && typeof r === 'object' && r.v === REPLAY_VERSION && typeof r.start === 'string' && Array.isArray(r.frames) &&
    typeof r.title === 'string' && typeof r.summary === 'string' && typeof r.at === 'number' && typeof r.ticks === 'number'
  );
}
