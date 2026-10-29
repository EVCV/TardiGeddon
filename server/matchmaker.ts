// Quick play: players wait in one queue and are put into a match together.
// A full match (4) starts at once; otherwise, once someone has waited a few
// seconds, everyone waiting (2+) goes in together. Anyone can choose to play
// a CPU instead of waiting. Players who blocked each other are never put in
// the same match. Signed-in players are matched with others of a similar
// rating first; the range widens the longer they wait (stats/rank.ts).

import type { Member } from './room';
import { START_RATING, ratingWindow } from '../src/stats/rank';

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

/** Close enough in rating, for how long the first has waited (guests count as new players). */
function similar(first: Waiting, other: Waiting, now: number): boolean {
  const a = first.member.rating ?? START_RATING;
  const b = other.member.rating ?? START_RATING;
  return Math.abs(a - b) <= ratingWindow(now - first.since);
}

/** Most players in one quick-play match. */
export const QUICK_MAX = 4;
/** How long to wait for more players once two are ready. */
export const QUICK_FILL_MS = 6000;

/** How a wait in the queue ended. */
export type WaitEnd = 'matched' | 'cpu' | 'gaveup' | 'error' | 'disconnected';

export class Matchmaker {
  private queue: Waiting[] = [];
  private lastCount = -1;
  /** Told how long each wait lasted and how it ended (for the anonymous play statistics). */
  onWaitEnd: ((ms: number, how: WaitEnd, member: Member) => void) | null = null;

  constructor(
    /** Create and start a match for these players (cpu: add a CPU opponent); false if it couldn't. */
    private makeMatch: (players: Waiting[], cpu: boolean) => unknown,
    private now: () => number = Date.now,
  ) {}

  get waiting(): number {
    return this.queue.length;
  }

  add(member: Member, team: unknown, blocks: Set<string> = new Set()): void {
    const was = this.queue.find((w) => w.member === member);
    if (was) {
      // Asked again while waiting: the new team and blocks, same place in the queue.
      was.team = team;
      was.blocks = blocks;
      return;
    }
    this.queue.push({ member, team, since: this.now(), blocks });
    this.announce(true);
  }

  /** Stop waiting: they gave up (or went), or disconnected. */
  remove(member: Member, how: WaitEnd = 'gaveup'): void {
    const w = this.queue.find((x) => x.member === member);
    if (!w) return;
    this.queue = this.queue.filter((x) => x !== w);
    this.ended(w, how);
    this.announce(true);
  }

  /** Stop waiting and play a CPU now. */
  vsCpu(member: Member): void {
    const w = this.queue.find((x) => x.member === member);
    if (!w) return;
    this.queue = this.queue.filter((x) => x !== w);
    this.announce(true);
    const ok = this.makeMatch([w], true) !== false;
    this.ended(w, ok ? 'cpu' : 'error');
  }

  private ended(w: Waiting, how: WaitEnd): void {
    this.onWaitEnd?.(this.now() - w.since, how, w.member);
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
      if (g.every((w) => friendly(w, this.queue[i])) && similar(g[0], this.queue[i], this.now())) g.push(this.queue[i]);
    }
    return g;
  }

  private take(g: Waiting[]): void {
    this.queue = this.queue.filter((w) => !g.includes(w));
    const ok = this.makeMatch(g, false) !== false;
    for (const w of g) this.ended(w, ok ? 'matched' : 'error');
  }

  /** Tell everyone waiting how many are in the queue (when it changes, or when forced). */
  private announce(force = false): void {
    if (!force && this.queue.length === this.lastCount) return;
    this.lastCount = this.queue.length;
    for (const w of this.queue) w.member.send({ t: 'queue', waiting: this.queue.length });
  }
}
