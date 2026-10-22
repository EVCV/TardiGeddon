// The game's easter eggs: what to find, and a riddle for each. Shared by the
// game (ui/eggs.ts keeps which ones this player found) and the website,
// which lists the riddles but never the answers. Finding them is just for
// fun: no coins, Slime or advantage.

export interface Egg {
  id: string;
  /** Shown once found. */
  name: string;
  /** The hint, shown before it's found (and on the website). */
  riddle: string;
}

export const EGGS: Egg[] = [
  { id: 'duck', name: 'Rubber duck', riddle: 'Something yellow floats where tardigrades fear to swim. It would like a poke.' },
  { id: 'ufo', name: 'Visitors', riddle: 'Keep an eye on the sky. If someone drops by, wave (well, tap).' },
  { id: 'rainbow', name: 'Rainbow', riddle: 'When the sun comes out, look up. Not every time, mind.' },
  { id: 'tornado', name: 'Twister', riddle: 'Once in a great many turns, the wind decides where everyone stands.' },
  { id: 'tickle', name: 'Ticklish', riddle: 'The tardigrade in the lobby is ticklish. Very ticklish. Ten times ticklish.' },
  { id: 'milnesium', name: 'Space traveller', riddle: 'Name one of your tardigrades after the real one that survived a trip to space.' },
];

export function isEgg(id: string): boolean {
  return EGGS.some((e) => e.id === id);
}
