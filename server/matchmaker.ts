// Quick play: players wait in one queue and are put into a match together.
// A full match (4) starts at once; otherwise, once someone has waited a few
// seconds, everyone waiting (2+) goes in together. Anyone can choose to play
// a CPU instead of waiting. Players who blocked each other are never put in
// the same match.

import type { Member } from './room';

export interface Waiting {
  member: Member;
  team: unknown;
  since: number;
  /** Player ids this player has blocked. */
  blocks: Set<string>;
}

/** Most blocked players a client may send (the rest are ignored). */
export const MAX_BLOCKS = 500;

/** Player ids from untrusted data. */
export function cleanBlocks(raw: unknown): Set<string> {
  if (!Array.isArray(raw)) return new Set();
  return new Set(raw.slice(0, MAX_BLOCKS).filter((x): x is string => typeof x === 'string' && /^[A-Za-z0-9_-]{1,32}$/.test(x)));
}

/** May these two play together? Not if either blocked the other. */
function friendly(a: Waiting, b: Waiting): boolean {
  return !(b.member.pid && a.blocks.has(b.member.pid)) && !(a.member.pid && b.blocks.has(a.member.pid));
}

/** Most players in one quick-play match. */
export const QUICK_MAX = 4;
/** How long to wait for more players once two are ready. */
export const QUICK_FILL_MS = 6000;

export class Matchmaker {
  private queue: Waiting[] = [];
  private lastCount = -1;

  constructor(
    /** Create and start a match for these players (cpu: add a CPU opponent). */
    private makeMatch: (players: Waiting[], cpu: boolean) => void,
    private now: () => number = Date.now,
  ) {}

  get waiting(): number {
    return this.queue.length;
  }

  add(member: Member, team: unknown, blocks: Set<string> = new Set()): void {
    if (this.queue.some((w) => w.member === member)) return;
    this.queue.push({ member, team, since: this.now(), blocks });
    this.announce(true);
  }

  remove(member: Member): void {
    const before = this.queue.length;
    this.queue = this.queue.filter((w) => w.member !== member);
    if (this.queue.length !== before) this.announce(true);
  }

  /** Stop waiting and play a CPU now. */
  vsCpu(member: Member): void {
    const w = this.queue.find((x) => x.member === member);
    if (!w) return;
    this.remove(member);
    this.makeMatch([w], true);
  }

  /** Call regularly (a few times a second). */
  tick(): void {
    // Full matches first, oldest players first.
    for (let i = 0; i < this.queue.length; ) {
      const g = this.group(i);
      if (g.length >= QUICK_MAX) this.take(g);
      else i++;
    }
    // Then anyone who has waited long enough goes in with whoever they can play.
    for (let i = 0; i < this.queue.length; ) {
      const g = this.queue[i] && this.now() - this.queue[i].since >= QUICK_FILL_MS ? this.group(i) : [];
      if (g.length >= 2) this.take(g);
      else i++;
    }
    this.announce();
  }

  /** The player at `start` and the next players (in queue order) everyone in the group may play with. */
  private group(start: number): Waiting[] {
    const g = [this.queue[start]];
    for (let i = start + 1; i < this.queue.length && g.length < QUICK_MAX; i++) {
      if (g.every((w) => friendly(w, this.queue[i]))) g.push(this.queue[i]);
    }
    return g;
  }

  private take(g: Waiting[]): void {
    this.queue = this.queue.filter((w) => !g.includes(w));
    this.makeMatch(g, false);
  }

  /** Tell everyone waiting how many are in the queue (when it changes, or when forced). */
  private announce(force = false): void {
    if (!force && this.queue.length === this.lastCount) return;
    this.lastCount = this.queue.length;
    for (const w of this.queue) w.member.send({ t: 'queue', waiting: this.queue.length });
  }
}
