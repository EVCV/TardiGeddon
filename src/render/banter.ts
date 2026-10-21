// Speech-bubble banter: tardis react to near misses, big hits and dunkings,
// and CPU teams taunt and make excuses. Purely cosmetic (render side), so
// it may use Math.random freely.

import type { SimEvent, WorldState } from '../sim/types';
import { TARDI_R } from '../sim/world';
import { t } from '../i18n/i18n';
import { tk } from '../i18n/tk';

const CPU_TAUNTS = [
  tk('Hmm… wind… maths…'),
  tk('Eeny, meeny, miny… you.'),
  tk('This one’s for my mum!'),
  tk('Watch and learn.'),
  tk('I’ve got this. Probably.'),
  tk('Calculating… nope, guessing.'),
  tk('Say cheese!'),
  tk('Nothing personal!'),
];
const MISSED_ME = [tk('Missed me!'), tk('Ha! Not even close!'), tk('Is that all?'), tk('Nice try!'), tk('Whoosh!'), tk('Indestructible, baby!')];
const EXCUSES = [tk('The wind did it!'), tk('Meant to do that.'), tk('Warning shot!'), tk('That was a practice one.'), tk('My claws slipped!'), tk('Who moved?')];
const OWN_GOAL = [tk('Oops.'), tk('Ow! My own fault.'), tk('I’ll pretend that didn’t happen.'), tk('Not again…')];
const SMALL_HIT = [tk('Ow!'), tk('Hey!'), tk('Rude!'), tk('That tickled.'), tk('Just a scratch!')];
const BIG_HIT = [tk('OUCH!'), tk('My cuticle!'), tk('Not the face!'), tk('I felt that in all eight legs!'), tk('Medic!'), tk('Revenge will be mine!')];
const DROWN = [tk('Glub glub…'), tk('Wait, I’m a water bear!'), tk('Tell my team I was brave!')];
const LAST_WORDS = [tk('I regret nothing!'), tk('Tell my mum I was brave!'), tk('Avenge meeee!'), tk('Not like this…'), tk('I’ll be back… in a million years.'), tk('Worth it.')];
const VICTORY = [tk('Too easy!'), tk('Water bears rule!'), tk('Who’s indestructible now?'), tk('Dance party!'), tk('GG, no re.'), tk('Victory tastes like moss!')];

/** A line from the list, in the player's language. */
const RACE_BEST = [tk('Personal best!'), tk('Yeeehaw!'), tk('Swing king!')];
const RACE_DONE = [tk('Made it!'), tk('Phew!'), tk('Not my fastest…')];

const pick = (list: string[]) => t(list[Math.floor(Math.random() * list.length)]);

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
          const shooter = s.tardis.find((x) => x.id === s.turn.activeTardi);
          if (!shooter) break;
          const reach = e.r + TARDI_R;
          const dist = (p: { x: number; y: number }) => Math.hypot(p.x - e.x, p.y - e.y);
          const alive = s.tardis.filter((x) => x.alive);
          if (dist(shooter) < reach) {
            if (Math.random() < 0.7) say(shooter.id, pick(OWN_GOAL));
            break;
          }
          if (alive.some((x) => x.team !== shooter.team && dist(x) < reach)) break; // a hit: the damage line will speak
          const near = alive.filter((x) => x.team !== shooter.team && dist(x) < reach + 140).sort((a, b) => dist(a) - dist(b))[0];
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
        case 'finish': {
          const racer = s.tardis.find((x) => x.id === s.turn.activeTardi);
          if (racer) say(racer.id, e.best ? pick(RACE_BEST) : pick(RACE_DONE));
          break;
        }
        case 'death':
          say(e.id, pick(LAST_WORDS));
          break;
        case 'gameover':
          // The winners left standing gloat, a beat apart.
          s.tardis
            .filter((x) => x.alive && x.team === e.winner)
            .forEach((x, i) => setTimeout(() => say(x.id, pick(VICTORY)), 600 + i * 450));
          break;
      }
    }
  }
}
