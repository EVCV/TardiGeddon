// Per-team match stats for players' accounts: enemy tardis popped, damage
// dealt, and the own goals (damage to your own team, your own tardis popped). Credit goes to the team whose turn it is when damage lands (the sim
// applies damage at the end of the attacker's turn). Used by the game server
// for online matches and by the game for matches against the CPU.

import type { SimEvent, WorldState } from '../sim/types';

export interface TeamTally {
  popped: number;
  damage: number;
  /** Own goals: damage to, and pops of, the team's own tardis on its own turns. */
  selfDamage: number;
  selfPopped: number;
}

export class MatchTally {
  readonly teams: TeamTally[];

  constructor(teamCount: number) {
    this.teams = Array.from({ length: teamCount }, () => ({ popped: 0, damage: 0, selfDamage: 0, selfPopped: 0 }));
  }

  /** Feed the events from one tick (call after tick()). */
  add(s: WorldState, events: readonly SimEvent[]): void {
    // Poison bites as a new turn starts: nobody's attack, so skip that tick.
    if (s.race || events.some((e) => e.t === 'turnStart')) return;
    const by = this.teams[s.turn.teamIdx];
    if (!by) return;
    for (const e of events) {
      if (e.t !== 'damage' && e.t !== 'death' && e.t !== 'drown') continue;
      const victim = s.tardis.find((t) => t.id === e.id);
      if (!victim) continue;
      const own = victim.team === s.turn.teamIdx;
      if (e.t === 'damage') {
        if (own) by.selfDamage += e.amount;
        else by.damage += e.amount;
      } else if (own) by.selfPopped++;
      else by.popped++;
    }
  }
}
