// Client side of a lockstep match: holds the local copy of the world and
// advances it only with the frames the server streams. DOM-free, so the
// same code runs in tests.

import { createWorld, tick, type TeamConfig } from '../sim/world';
import { DEFAULT_SCHEME, type InputFrame, type Scheme, type SimEvent, type WorldState } from '../sim/types';
import { decodeWorld, syncHash } from './snapshot';
import { fromWire, type WireFrame } from './protocol';

export class Lockstep {
  state: WorldState;
  /** Our team index in this match. */
  you: number;
  /** Set when our hash disagreed with the server's; cleared by a snapshot. */
  desynced = false;
  private queue: InputFrame[] = [];
  private hashes = new Map<number, number>();

  constructor(state: WorldState, you: number) {
    this.state = state;
    this.you = you;
  }

  /** A new match, built exactly as the server built it. */
  static start(seed: number, scheme: Partial<Scheme>, teams: TeamConfig[], you: number): Lockstep {
    return new Lockstep(createWorld({ seed, teams, scheme: { ...DEFAULT_SCHEME, ...scheme } }), you);
  }

  /** Joining (or rejoining) a match already under way. */
  static fromSnapshot(json: string, you: number): Lockstep {
    return new Lockstep(decodeWorld(json), you);
  }

  /** Frames ready to play. */
  get buffered(): number {
    return this.queue.length;
  }

  onFrames(from: number, frames: WireFrame[]): void {
    const expected = this.state.tick + this.queue.length;
    // Drop any frames we already have (e.g. sent before a snapshot).
    const skip = expected - from;
    if (skip < 0) {
      // A gap means we missed something: ask for a snapshot.
      this.desynced = true;
      return;
    }
    for (let i = skip; i < frames.length; i++) this.queue.push(fromWire(frames[i]));
  }

  onHash(tickNo: number, h: number): void {
    if (tickNo <= this.state.tick) {
      if (tickNo === this.state.tick && syncHash(this.state) !== h) this.desynced = true;
      return;
    }
    this.hashes.set(tickNo, h);
  }

  onSnapshot(json: string, you: number): void {
    this.state = decodeWorld(json);
    this.you = you;
    this.queue = [];
    this.hashes.clear();
    this.desynced = false;
  }

  /** Play one buffered frame. Returns false if none is ready. */
  step(events: SimEvent[]): boolean {
    const f = this.queue.shift();
    if (!f) return false;
    tick(this.state, f, events);
    const want = this.hashes.get(this.state.tick);
    if (want !== undefined) {
      this.hashes.delete(this.state.tick);
      if (syncHash(this.state) !== want) this.desynced = true;
    }
    return true;
  }

  get myTurn(): boolean {
    return this.state.turn.teamIdx === this.you && this.state.turn.phase !== 'gameover';
  }
}
