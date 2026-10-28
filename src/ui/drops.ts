// The lobby's banner for something new: a seasonal event's free world, or new
// looks in the Shop (src/shop/drops.ts). It stays until the player closes it,
// then stays closed until the next one.

import { DROPS } from '../shop/drops';
import { currentSeason, seasonEnds } from '../render/seasons';
import { arenaTheme } from '../render/arenas';
import { lang, t } from '../i18n/i18n';

export interface NewThing {
  id: string;
  text: string;
  /** Where its button goes: the World picker (a seasonal world) or the Shop. */
  open: 'looks' | 'shop';
}

const KEY = 'tardigeddon.newSeen';

/** What's new now, if anything (the newest, if two overlap). */
export function newThing(now = new Date()): NewThing | null {
  const today = now.toISOString().slice(0, 10);
  const day = 86_400_000;
  const drop = DROPS.filter((d) => d.from <= today && Date.parse(today) < Date.parse(d.from) + (d.days ?? 30) * day).sort((a, b) => b.from.localeCompare(a.from))[0];
  if (drop) return { id: `drop-${drop.id}`, text: `${drop.emoji} ${t(drop.name)}: ${t(drop.blurb)}`, open: 'shop' };
  const season = currentSeason(now);
  if (!season) return null;
  // The end date in the player's language (English keeps its own short form).
  const ends = lang() === 'en' ? seasonEnds(season) : new Date(2000, season.to[0] - 1, season.to[1]).toLocaleDateString(lang(), { day: 'numeric', month: 'short' });
  // Once a year: the season's id and the year it started in.
  const year = now.getUTCMonth() + 1 < season.from[0] ? now.getUTCFullYear() - 1 : now.getUTCFullYear();
  return {
    id: `season-${season.id}-${year}`,
    text: `${season.emoji} ${t('{season}! The {world} world is free until {date}.', { season: t(season.name), world: t(arenaTheme(season.arena).name), date: ends })}`,
    open: 'looks',
  };
}

/** Has the player closed this one? */
export function newThingSeen(id: string): boolean {
  try {
    return localStorage.getItem(KEY) === id;
  } catch {
    return false;
  }
}

export function closeNewThing(id: string): void {
  try {
    localStorage.setItem(KEY, id);
  } catch {
    // can't remember: it shows again next visit
  }
}
