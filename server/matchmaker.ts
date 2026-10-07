// Quick play: players wait in one queue and are put into a match together.
// A full match (4) starts at once; otherwise, once someone has waited a few
// seconds, everyone waiting (2+) goes in together. Anyone can choose to play
// a CPU instead of waiting.

import type { Member } from './room';

export interface Waiting {
  member: Member;
  team: unknown;
  since: number;
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

  add(member: Member, team: unknown): void {
    if (this.queue.some((w) => w.member === member)) return;
    this.queue.push({ member, team, since: this.now() });
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
    while (this.queue.length >= QUICK_MAX) this.makeMatch(this.queue.splice(0, QUICK_MAX), false);
    if (this.queue.length >= 2 && this.now() - this.queue[0].since >= QUICK_FILL_MS) {
      this.makeMatch(this.queue.splice(0), false);
    }
    this.announce();
  }

  /** Tell everyone waiting how many are in the queue (when it changes, or when forced). */
  private announce(force = false): void {
    if (!force && this.queue.length === this.lastCount) return;
    this.lastCount = this.queue.length;
    for (const w of this.queue) w.member.send({ t: 'queue', waiting: this.queue.length });
  }
}
