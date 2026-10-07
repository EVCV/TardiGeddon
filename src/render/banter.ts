// Speech-bubble banter: tardis react to near misses, big hits and dunkings,
// and CPU teams taunt and make excuses. Purely cosmetic (render side), so
// it may use Math.random freely.

import type { SimEvent, WorldState } from '../sim/types';
import { TARDI_R } from '../sim/world';

const CPU_TAUNTS = [
  'Hmm… wind… maths…',
  'Eeny, meeny, miny… you.',
  'This one’s for my mum!',
  'Watch and learn.',
  'I’ve got this. Probably.',
  'Calculating… nope, guessing.',
  'Say cheese!',
  'Nothing personal!',
];
const MISSED_ME = ['Missed me!', 'Ha! Not even close!', 'Is that all?', 'Nice try!', 'Whoosh!', 'Indestructible, baby!'];
const EXCUSES = ['The wind did it!', 'Meant to do that.', 'Warning shot!', 'That was a practice one.', 'My claws slipped!', 'Who moved?'];
const OWN_GOAL = ['Oops.', 'Ow! My own fault.', 'I’ll pretend that didn’t happen.', 'Not again…'];
const SMALL_HIT = ['Ow!', 'Hey!', 'Rude!', 'That tickled.', 'Just a scratch!'];
const BIG_HIT = ['OUCH!', 'My cuticle!', 'Not the face!', 'I felt that in all eight legs!', 'Medic!', 'Revenge will be mine!'];
const DROWN = ['Glub glub…', 'Wait, I’m a water bear!', 'Tell my team I was brave!'];
const LAST_WORDS = ['I regret nothing!', 'Tell my mum I was brave!', 'Avenge meeee!', 'Not like this…', 'I’ll be back… in a million years.', 'Worth it.'];
const VICTORY = ['Too easy!', 'Water bears rule!', 'Who’s indestructible now?', 'Dance party!', 'GG, no re.', 'Victory tastes like moss!'];

const pick = (list: string[]) => list[Math.floor(Math.random() * list.length)];

export type Say = (tardiId: number, text: string) => void;

export class Banter {
  /** Only the first blast of each turn gets a reaction. */
  private reacted = false;

  onEvents(s: WorldState, events: SimEvent[], say: Say): void {
    let hurtSaid = 0;
    for (const e of events) {
      switch (e.t) {
        case 'turnStart':
          this.reacted = false;
          if (s.teams[e.team]?.cpu && Math.random() < 0.45) say(e.tardi, pick(CPU_TAUNTS));
          break;
        case 'explosion': {
          if (this.reacted) break;
          this.reacted = true;
          const shooter = s.tardis.find((t) => t.id === s.turn.activeTardi);
          if (!shooter) break;
          const reach = e.r + TARDI_R;
          const dist = (t: { x: number; y: number }) => Math.hypot(t.x - e.x, t.y - e.y);
          const alive = s.tardis.filter((t) => t.alive);
          if (dist(shooter) < reach) {
            if (Math.random() < 0.7) say(shooter.id, pick(OWN_GOAL));
            break;
          }
          if (alive.some((t) => t.team !== shooter.team && dist(t) < reach)) break; // a hit: the damage line will speak
          const near = alive.filter((t) => t.team !== shooter.team && dist(t) < reach + 140).sort((a, b) => dist(a) - dist(b))[0];
          if (near && Math.random() < 0.65) say(near.id, pick(MISSED_ME));
          else if (s.teams[shooter.team]?.cpu && Math.random() < 0.6) say(shooter.id, pick(EXCUSES));
          break;
        }
        case 'damage':
          if (hurtSaid < 2 && Math.random() < 0.6) {
            hurtSaid++;
            say(e.id, pick(e.amount >= 35 ? BIG_HIT : SMALL_HIT));
          }
          break;
        case 'drown':
          say(e.id, pick(DROWN));
          break;
        case 'death':
          say(e.id, pick(LAST_WORDS));
          break;
        case 'gameover':
          // The winners left standing gloat, a beat apart.
          s.tardis
            .filter((t) => t.alive && t.team === e.winner)
            .forEach((t, i) => setTimeout(() => say(t.id, pick(VICTORY)), 600 + i * 450));
          break;
      }
    }
  }
}
