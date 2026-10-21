// Records each turn so the winning shot can be shown again: a copy of the
// world as the turn began, and every input frame played in it. The sim is
// deterministic, so playing those frames on that copy gives exactly the
// same shot (local and online alike). DOM-free.

import { cloneWorld } from '../sim/world';
import type { InputFrame, SimEvent, WorldState } from '../sim/types';

export interface TurnRecording {
  start: WorldState;
  frames: InputFrame[];
}

export class TurnRecorder {
  private cur: (TurnRecording & { turn: number; fired: boolean }) | null = null;
  /** The last turn in which something was fired. */
  private lastShot: TurnRecording | null = null;

  /** Call before tick() with the frame it will play. */
  before(s: WorldState, f: InputFrame): void {
    if (s.turn.phase === 'gameover') return;
    if (!this.cur || this.cur.turn !== s.turn.turnNumber) {
      this.cur = { start: cloneWorld(s), frames: [], turn: s.turn.turnNumber, fired: false };
    }
    this.cur.frames.push(f);
  }

  /** Call after tick() with the events it produced. */
  after(events: readonly SimEvent[]): void {
    const c = this.cur;
    if (!c) return;
    if (!c.fired && events.some((e) => e.t === 'fire' || e.t === 'explosion')) c.fired = true;
    if (c.fired) this.lastShot = c;
  }

  /** The turn that decided the match (the last one with a shot), if any. */
  winningShot(): TurnRecording | null {
    return this.lastShot;
  }
}
