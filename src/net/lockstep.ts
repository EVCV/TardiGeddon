// Client side of a lockstep match: holds the local copy of the world and
// advances it only with the frames the server streams. DOM-free, so the
// same code runs in tests.

import { activeTardi, createWorld, tick, type TeamConfig } from '../sim/world';
import { BTN_DOWN, BTN_FIRE, BTN_UP, DEFAULT_SCHEME, type Command, type InputFrame, type Scheme, type SimEvent, type WorldState } from '../sim/types';
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

/**
 * Online, the server is ahead of what the player sees by the connection's
 * delay, so holding Fire or ▲▼ there runs on past where the player let go:
 * shots go long, aims overshoot. Letting go therefore also sends what the
 * player saw: the power on screen, and the aim once they've seen it move (a
 * quick tap they haven't seen yet goes as it is).
 */
export class SeenInput {
  private aimAtPress: number | null = null;

  /** The frames to send for `f`, given the buttons the server last got and the world on screen. */
  frames(f: InputFrame, sentHeld: number, s: WorldState): InputFrame[] {
    const aimBits = BTN_UP | BTN_DOWN;
    if ((sentHeld & aimBits) === 0 && (f.held & aimBits) !== 0) this.aimAtPress = s.turn.aim;
    const extra: Command[] = [];
    if ((sentHeld & BTN_FIRE) !== 0 && (f.held & BTN_FIRE) === 0 && s.turn.charging) extra.push({ t: 'power', p: s.turn.power });
    if ((sentHeld & aimBits) !== 0 && (f.held & aimBits) === 0) {
      const t = activeTardi(s);
      if (this.aimAtPress !== null && s.turn.aim !== this.aimAtPress && s.turn.phase === 'aim' && t && !t.rope) {
        extra.push({ t: 'aim', facing: t.facing, aim: s.turn.aim });
      }
      this.aimAtPress = null;
    }
    if (extra.length === 0) return [f];
    // One command per frame: the first carries the buttons, any of the player's own goes last.
    const out = extra.map((cmd, i): InputFrame => ({ held: f.held, pressed: i === 0 ? f.pressed : 0, cmd }));
    if (f.cmd) out.push({ held: f.held, pressed: 0, cmd: f.cmd });
    return out;
  }
}

/** No frames for this long (ms) mid-match: the connection is struggling. */
export const SLOW_MS = 700;
/** No frames for this long: give up on the connection and reconnect. */
export const LOST_MS = 6000;

/** How the connection is doing, from how long ago the server last sent frames. */
export function connectionState(sinceFrames: number): 'ok' | 'slow' | 'lost' {
  return sinceFrames >= LOST_MS ? 'lost' : sinceFrames >= SLOW_MS ? 'slow' : 'ok';
}
